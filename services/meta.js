const crypto = require("crypto");

const metaPixelId = String(process.env.META_PIXEL_ID || "").trim();
const metaCapiToken = String(process.env.META_CAPI_TOKEN || "").trim();
const metaApiVersion = String(process.env.META_API_VERSION || "v23.0").trim();
const metaTestEventCode = String(process.env.META_TEST_EVENT_CODE || "").trim();

function getMetaConfigState() {
  return {
    enabled: Boolean(metaPixelId),
    capiEnabled: Boolean(metaPixelId && metaCapiToken),
    pixelId: metaPixelId,
    apiVersion: metaApiVersion,
    hasTestEventCode: Boolean(metaTestEventCode),
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function buildUserData({ req, payload = {}, tracking = {} }) {
  const cookies = parseCookies(req.headers.cookie || "");
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  const fullName = String(payload.fullName || "").trim().toLowerCase();

  const userData = {
    client_ip_address: req.ip,
    client_user_agent: req.get("user-agent") || "",
    fbp: tracking.fbp || cookies._fbp || "",
    fbc: tracking.fbc || cookies._fbc || "",
  };

  if (email) {
    userData.em = sha256(email);
  }

  if (phone) {
    userData.ph = sha256(phone);
  }

  if (fullName) {
    userData.external_id = sha256(fullName);
  }

  return Object.fromEntries(
    Object.entries(userData).filter(([, value]) => String(value || "").trim() !== "")
  );
}

function buildCustomData(eventName, payload = {}, fileUrl = "") {
  if (eventName !== "Lead") {
    return undefined;
  }

  const customData = {
    currency: "UAH",
    value: 0,
    lead_type: "landing_form",
    content_name: "3D printing lead",
  };

  if (payload.quantity && Number.isFinite(Number(payload.quantity))) {
    customData.quantity = Number(payload.quantity);
  }

  if (payload.material) {
    customData.content_category = payload.material;
  }

  if (fileUrl) {
    customData.content_ids = [fileUrl];
  }

  return customData;
}

async function sendMetaEvent({ req, eventName, eventId, eventSourceUrl, payload = {}, tracking = {}, fileUrl = "" }) {
  if (!metaPixelId || !metaCapiToken) {
    return { skipped: true, reason: "META_NOT_CONFIGURED" };
  }

  const requestBody = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: eventSourceUrl,
        action_source: "website",
        user_data: buildUserData({ req, payload, tracking }),
        custom_data: buildCustomData(eventName, payload, fileUrl),
      },
    ],
  };

  if (metaTestEventCode) {
    requestBody.test_event_code = metaTestEventCode;
  }

  const response = await fetch(
    `https://graph.facebook.com/${metaApiVersion}/${metaPixelId}/events?access_token=${encodeURIComponent(metaCapiToken)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = result?.error?.message || "META_CAPI_REQUEST_FAILED";
    throw new Error(errorMessage);
  }

  return result;
}

module.exports = {
  getMetaConfigState,
  sendMetaEvent,
};
