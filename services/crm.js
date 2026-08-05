const sourceLabel = process.env.CRM_SOURCE_LABEL || "Landing page";
const mockModeEnabled = process.env.CRM_MOCK_MODE === "true";

function readEnvValue(name) {
  return String(process.env[name] || "").trim();
}

function getCrmConfigState() {
  const apiKey = readEnvValue("KEYCRM_API_KEY");
  const sourceIdRaw = readEnvValue("KEYCRM_SOURCE_ID");
  const sourceId = Number(sourceIdRaw);

  return {
    provider: "keycrm",
    mockModeEnabled,
    hasApiKey: Boolean(apiKey),
    hasSourceId: Boolean(sourceIdRaw),
    sourceIdIsValid: Number.isInteger(sourceId) && sourceId > 0,
    baseUrl: getKeyCrmBaseUrl(),
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
  ];

  pushIfValue(lines, "Email", payload.email);
  pushIfValue(lines, "Кількість деталей", payload.quantity);
  pushIfValue(lines, "Матеріал", payload.material);
  pushIfValue(lines, "Коментар", payload.comment);
  pushIfValue(lines, "Ім'я файлу", payload.fileName);
  pushIfValue(lines, "Посилання на файл", fileUrl || "");
  pushIfValue(lines, "Джерело", sourceLabel);

  return lines.join("\n");
}

function getKeyCrmBaseUrl() {
  return (process.env.KEYCRM_BASE_URL || "https://openapi.keycrm.app/v1").replace(/\/$/, "");
}

function getCustomFields(payload, fileUrl) {
  const fieldMap = [
    ["KEYCRM_CUSTOM_FIELD_COMMENT", payload.comment],
    ["KEYCRM_CUSTOM_FIELD_QUANTITY", payload.quantity],
    ["KEYCRM_CUSTOM_FIELD_MATERIAL", payload.material],
    ["KEYCRM_CUSTOM_FIELD_FILE_URL", fileUrl],
    ["KEYCRM_CUSTOM_FIELD_FILE_NAME", payload.fileName],
  ];

  return fieldMap.reduce((accumulator, [envName, value]) => {
    const fieldId = process.env[envName];
    if (fieldId && value) {
      accumulator.push({
        uuid: fieldId,
        value,
      });
    }

    return accumulator;
  }, []);
}

function buildKeyCrmOrder(payload, fileUrl) {
  const sourceId = Number(readEnvValue("KEYCRM_SOURCE_ID"));

  if (!Number.isInteger(sourceId) || sourceId < 1) {
    throw new Error("CRM_NOT_CONFIGURED_SOURCE_ID");
  }

  const order = {
    source_id: sourceId,
    buyer: {
      full_name: payload.fullName,
      phone: payload.phone,
    },
    description: buildComment(payload, fileUrl),
    custom_fields: getCustomFields(payload, fileUrl),
  };

  if (payload.email) {
    order.buyer.email = payload.email;
  }

  if (readEnvValue("KEYCRM_MANAGER_ID")) {
    const managerId = Number(readEnvValue("KEYCRM_MANAGER_ID"));
    if (Number.isInteger(managerId) && managerId > 0) {
      order.manager_id = managerId;
    }
  }

  if (!order.custom_fields.length) {
    delete order.custom_fields;
  }

  return order;
}

async function createKeyCrmItem(payload, fileUrl) {
  const apiKey = readEnvValue("KEYCRM_API_KEY");

  if (!apiKey) {
    throw new Error("CRM_NOT_CONFIGURED_API_KEY");
  }

  const endpoint = `${getKeyCrmBaseUrl()}/order`;
  const requestBody = buildKeyCrmOrder(payload, fileUrl);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
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

  if (!response.ok) {
    console.error("KeyCRM API error", {
      status: response.status,
      message: responseData?.message || "unknown_error",
    });
    throw new Error("CRM_API_ERROR");
  }

  const recordId = String(
    responseData?.id ||
    responseData?.data?.id ||
    responseData?.order_id ||
    ""
  );

  if (!recordId) {
    console.error("KeyCRM API invalid response", {
      status: response.status,
    });
    throw new Error("CRM_INVALID_RESPONSE");
  }

  return recordId;
}

async function createMockCrmItem(payload, fileUrl) {
  const safePreview = {
    provider: "keycrm",
    fullName: payload.fullName,
    phone: payload.phone,
    email: payload.email,
    quantity: payload.quantity,
    material: payload.material,
    fileName: payload.fileName,
    hasFileUrl: Boolean(fileUrl),
    source: sourceLabel,
  };

  console.log("CRM mock order", safePreview);
  return `mock-${Date.now()}`;
}

async function createCrmItem(payload, fileUrl) {
  if (mockModeEnabled) {
    return createMockCrmItem(payload, fileUrl);
  }

  return createKeyCrmItem(payload, fileUrl);
}

module.exports = {
  createCrmItem,
  getCrmConfigState,
};
