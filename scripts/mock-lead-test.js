const { Readable, Writable } = require("stream");

process.env.CRM_MOCK_MODE = "true";
process.env.CRM_PROVIDER = process.env.CRM_PROVIDER || "zoho";
process.env.APP_BASE_URL = process.env.APP_BASE_URL || "http://example.test";
process.env.MAX_FILE_SIZE_MB = process.env.MAX_FILE_SIZE_MB || "50";

const { app } = require("../server");

function createMultipartBody() {
  const boundary = "----3dAstraMockBoundary";
  const parts = [];

  function pushField(name, value) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${value}\r\n`
      )
    );
  }

  pushField("fullName", "Тест Користувач");
  pushField("phone", "+380501112233");
  pushField("email", "test@example.com");
  pushField("comment", "Тестова заявка на серійний друк");
  pushField("quantity", "25");
  pushField("material", "PETG");
  pushField("privacyAccepted", "yes");

  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="3d-astra-mock-test.stl"\r\n` +
        `Content-Type: application/sla\r\n\r\n`
    )
  );
  parts.push(Buffer.from("solid mock\nendsolid mock\n"));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    boundary,
    body: Buffer.concat(parts),
  };
}

function createMockRequest(body, boundary) {
  const req = new Readable({
    read() {},
  });
  req.method = "POST";
  req.url = "/api/leads";
  req.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.length),
    host: "localhost",
  };
  req.connection = { remoteAddress: "127.0.0.1" };
  req.socket = { remoteAddress: "127.0.0.1" };
  req.ip = "127.0.0.1";
  req.httpVersion = "1.1";
  req.complete = false;
  req.aborted = false;

  process.nextTick(() => {
    req.push(body);
    req.push(null);
    req.complete = true;
  });

  return req;
}

function createMockResponse() {
  const chunks = [];

  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });

  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (key, value) => {
    res.headers[String(key).toLowerCase()] = value;
  };
  res.getHeader = (key) => res.headers[String(key).toLowerCase()];
  res.removeHeader = (key) => {
    delete res.headers[String(key).toLowerCase()];
  };
  res.writeHead = (statusCode, headers = {}) => {
    res.statusCode = statusCode;
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    return res;
  };
  res.end = (chunk) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    res.emit("finish");
    return res;
  };
  res.json = (payload) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = (payload) => {
    if (typeof payload === "object" && !Buffer.isBuffer(payload)) {
      return res.json(payload);
    }
    res.end(payload);
    return res;
  };

  return { res, chunks };
}

async function main() {
  const { boundary, body } = createMultipartBody();
  const req = createMockRequest(body, boundary);
  const { res, chunks } = createMockResponse();

  await new Promise((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
    app.handle(req, res, reject);
  });

  const responseText = Buffer.concat(chunks).toString("utf8");
  let responseBody = null;

  try {
    responseBody = JSON.parse(responseText);
  } catch (_error) {
    responseBody = responseText;
  }

  console.log("Mock lead test status:", res.statusCode);
  console.log("Mock lead test body:", JSON.stringify(responseBody, null, 2));

  if (res.statusCode !== 200 || !responseBody?.success || !responseBody?.leadId) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
