const sourceLabel = process.env.CRM_SOURCE_LABEL || "Landing page";
const mockModeEnabled = process.env.CRM_MOCK_MODE === "true";

let zohoTokenCache = {
  accessToken: "",
  apiDomain: "",
  expiresAt: 0,
};

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || parts[0] || "Заявка",
  };
}

function pushIfValue(lines, label, value) {
  if (value) {
    lines.push(`${label}: ${value}`);
  }
}

function buildComment(payload, fileUrl) {
  const lines = [
    "Заявка з сайту 3dAstra",
    `Дата та час заявки: ${new Date().toISOString()}`,
    `Ім'я: ${payload.fullName}`,
    `Телефон: ${payload.phone}`,
    `Email: ${payload.email}`,
  ];

  pushIfValue(lines, "Компанія", payload.company);
  pushIfValue(lines, "Кількість деталей", payload.quantity);
  pushIfValue(lines, "Матеріал", payload.material);
  pushIfValue(lines, "Коментар", payload.comment);
  pushIfValue(lines, "Ім'я файлу", payload.fileName);
  pushIfValue(lines, "Посилання на файл", fileUrl || "");
  pushIfValue(lines, "Джерело", sourceLabel);

  return lines.join("\n");
}

function addCustomFieldIfConfigured(fields, envName, value) {
  const fieldCode = process.env[envName];
  if (fieldCode && value) {
    fields[fieldCode] = value;
  }
}

function getZohoAccountsUrl() {
  return process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.eu";
}

async function refreshZohoAccessToken() {
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("CRM_NOT_CONFIGURED");
  }

  if (zohoTokenCache.accessToken && zohoTokenCache.expiresAt > Date.now() + 60_000) {
    return zohoTokenCache;
  }

  const tokenEndpoint = `${getZohoAccountsUrl().replace(/\/$/, "")}/oauth/v2/token`;
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const responseText = await response.text();
  let responseData = null;

  try {
    responseData = responseText ? JSON.parse(responseText) : null;
  } catch (_error) {
    responseData = null;
  }

  if (!response.ok || !responseData?.access_token) {
    console.error("Zoho OAuth error", {
      status: response.status,
      error: responseData?.error || "unknown_error",
    });
    throw new Error("CRM_PROVIDER_SETUP_REQUIRED");
  }

  zohoTokenCache = {
    accessToken: responseData.access_token,
    apiDomain: responseData.api_domain || process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.eu",
    expiresAt: Date.now() + Number(responseData.expires_in || 3600) * 1000,
  };

  return zohoTokenCache;
}

function buildZohoRecord(payload, fileUrl) {
  const { firstName, lastName } = splitFullName(payload.fullName);
  const comment = buildComment(payload, fileUrl);
  const companyName = payload.company || "Website inquiry";

  const record = {
    Last_Name: lastName || "Заявка",
    First_Name: firstName,
    Company: companyName,
    Phone: payload.phone,
    Email: payload.email,
    Description: comment,
    Lead_Source: sourceLabel,
  };

  addCustomFieldIfConfigured(record, "ZOHO_FIELD_COMMENT", payload.comment);
  addCustomFieldIfConfigured(record, "ZOHO_FIELD_QUANTITY", payload.quantity);
  addCustomFieldIfConfigured(record, "ZOHO_FIELD_MATERIAL", payload.material);
  addCustomFieldIfConfigured(record, "ZOHO_FIELD_FILE_URL", fileUrl);
  addCustomFieldIfConfigured(record, "ZOHO_FIELD_FILE_NAME", payload.fileName);
  addCustomFieldIfConfigured(record, "ZOHO_FIELD_PHONE", payload.phone);
  addCustomFieldIfConfigured(record, "ZOHO_FIELD_EMAIL", payload.email);

  return record;
}

async function createZohoCrmItem(payload, fileUrl) {
  const { accessToken, apiDomain } = await refreshZohoAccessToken();
  const moduleName = process.env.ZOHO_MODULE || "Leads";
  const endpoint = `${apiDomain.replace(/\/$/, "")}/crm/v8/${encodeURIComponent(moduleName)}`;
  const requestBody = {
    data: [buildZohoRecord(payload, fileUrl)],
    trigger: [],
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  let responseData = null;

  try {
    responseData = responseText ? JSON.parse(responseText) : null;
  } catch (_error) {
    responseData = null;
  }

  const firstItem = responseData?.data?.[0];
  if (!response.ok || firstItem?.status === "error") {
    console.error("Zoho API error", {
      module: moduleName,
      status: response.status,
      error: firstItem?.code || responseData?.code || "unknown_error",
    });
    throw new Error("CRM_API_ERROR");
  }

  const recordId = String(firstItem?.details?.id || "");
  if (!recordId) {
    console.error("Zoho API invalid response", {
      module: moduleName,
      status: response.status,
    });
    throw new Error("CRM_INVALID_RESPONSE");
  }

  return recordId;
}

async function createMockCrmItem(payload, fileUrl) {
  const safePreview = {
    provider: "zoho",
    title: `Заявка з сайту на 3D-друк — ${payload.fullName}`,
    fullName: payload.fullName,
    phone: payload.phone,
    email: payload.email,
    quantity: payload.quantity,
    material: payload.material,
    fileName: payload.fileName,
    hasFileUrl: Boolean(fileUrl),
    source: sourceLabel,
  };

  console.log("CRM mock lead", safePreview);
  return `mock-${Date.now()}`;
}

async function createCrmItem(payload, fileUrl) {
  if (mockModeEnabled) {
    return createMockCrmItem(payload, fileUrl);
  }

  return createZohoCrmItem(payload, fileUrl);
}

module.exports = {
  createCrmItem,
};
