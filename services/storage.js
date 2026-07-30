const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const storageDir = path.join(__dirname, "..", "uploads", "storage");
const signingSecret =
  process.env.FILE_URL_SIGNING_SECRET || "3d-astra-local-storage";

fs.mkdirSync(storageDir, { recursive: true });

function toSafeStoredName(originalName) {
  const extension = path.extname(originalName).toLowerCase();
  const baseName = path
    .basename(originalName, extension)
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .slice(0, 80);

  return `${Date.now()}-${crypto.randomUUID()}-${baseName}${extension}`;
}

async function saveFile(file) {
  if (!file) {
    return null;
  }

  const storedName = toSafeStoredName(file.originalname);
  const destinationPath = path.join(storageDir, storedName);

  await fs.promises.rename(file.path, destinationPath);

  return {
    id: storedName,
    fileName: file.originalname,
    storedName,
    path: destinationPath,
    mimeType: file.mimetype,
    size: file.size,
  };
}

function createSignature(storedName, expires) {
  return crypto
    .createHmac("sha256", signingSecret)
    .update(`${storedName}:${expires}`)
    .digest("hex");
}

function getFileUrl(fileRecord) {
  if (!fileRecord) {
    return "";
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    return "";
  }

  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const signature = createSignature(fileRecord.storedName, expires);
  const normalizedBaseUrl = appBaseUrl.replace(/\/$/, "");

  return `${normalizedBaseUrl}/api/files/${encodeURIComponent(
    fileRecord.storedName
  )}?expires=${expires}&signature=${signature}`;
}

async function deleteFile(fileRecord) {
  if (!fileRecord?.path) {
    return;
  }

  await fs.promises.unlink(fileRecord.path).catch(() => {});
}

async function getFileByStoredName(storedName) {
  const safeName = path.basename(storedName || "");
  if (!safeName) {
    return null;
  }

  const filePath = path.join(storageDir, safeName);

  try {
    const stats = await fs.promises.stat(filePath);
  return {
    storedName: safeName,
    path: filePath,
    size: stats.size,
    mimeType: "application/octet-stream",
  };
  } catch (_error) {
    return null;
  }
}

function isValidFileAccess(storedName, expires, signature) {
  const safeName = path.basename(storedName || "");
  if (!safeName || !expires || !signature) {
    return false;
  }

  if (Number(expires) < Date.now()) {
    return false;
  }

  const expectedSignature = createSignature(safeName, expires);
  const actualSignature = String(signature);

  if (expectedSignature.length !== actualSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(actualSignature)
  );
}

module.exports = {
  saveFile,
  getFileUrl,
  deleteFile,
  getFileByStoredName,
  isValidFileAccess,
};
