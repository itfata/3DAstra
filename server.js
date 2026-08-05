require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");

const { createCrmItem, getCrmConfigState } = require("./services/crm");
const { getMetaConfigState, sendMetaEvent } = require("./services/meta");
const storageService = require("./services/storage");

const app = express();
const uploadsDir = path.join(__dirname, "uploads", "tmp");
const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 50);
const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;

const allowedExtensions = new Set([".stl", ".3mf", ".step", ".stp", ".obj", ".zip"]);
const phonePattern = /^\+?[0-9\s()\-]{9,20}$/;
const allowedMimeTypes = new Set([
  "application/sla",
  "model/stl",
  "application/octet-stream",
  "model/3mf",
  "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
  "application/step",
  "model/step",
  "application/zip",
  "application/x-zip-compressed",
]);
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean)
  : [];

fs.mkdirSync(uploadsDir, { recursive: true });
app.set("trust proxy", 1);

const multerStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDir);
  },
  filename: (_req, file, callback) => {
    const safeBaseName = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .slice(0, 80);

    callback(
      null,
      `${Date.now()}-${safeBaseName}${path.extname(file.originalname).toLowerCase()}`
    );
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: maxFileSizeBytes },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      callback(new Error("Непідтримуваний формат файлу."));
      return;
    }

     if (file.mimetype && !allowedMimeTypes.has(file.mimetype)) {
      callback(new Error("Файл має неприпустимий MIME-тип."));
      return;
    }

    callback(null, true);
  },
});

function normalizeLeadPayload(body, file) {
  return {
    fullName: sanitizeInput(body.fullName),
    phone: sanitizeInput(body.phone),
    email: body.email ? sanitizeInput(body.email) : "",
    comment: sanitizeInput(body.comment),
    quantity: body.quantity ? sanitizeInput(body.quantity) : "",
    material: body.material ? sanitizeInput(body.material) : "",
    privacyAccepted: sanitizeInput(body.privacyAccepted),
    website: sanitizeInput(body.website),
    fileName: file?.originalname || "",
    metaEventId: sanitizeInput(body.metaEventId),
    metaFbp: sanitizeInput(body.metaFbp),
    metaFbc: sanitizeInput(body.metaFbc),
    pageUrl: sanitizeInput(body.pageUrl),
  };
}

function sanitizeInput(value) {
  return String(value || "")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validateLeadPayload(payload, file) {
  if (payload.website) {
    return "Не вдалося обробити заявку.";
  }

  if (
    !payload.fullName ||
    !payload.phone ||
    !payload.privacyAccepted
  ) {
    return "Заповніть обов'язкові поля форми.";
  }

  if (!phonePattern.test(payload.phone)) {
    return "Вкажіть коректний номер телефону.";
  }

  if (
    payload.quantity &&
    (!Number.isInteger(Number(payload.quantity)) || Number(payload.quantity) < 1)
  ) {
    return "Кількість деталей має бути більшою за нуль.";
  }

  return "";
}

async function cleanupTempFile(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

const leadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Занадто багато спроб. Спробуйте трохи пізніше.",
  },
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin denied"));
    },
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
  },
}));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    maxFileSizeMb,
    crm: getCrmConfigState(),
    meta: getMetaConfigState(),
  });
});

app.post("/api/tracking/page-view", async (req, res) => {
  const metaState = getMetaConfigState();
  if (!metaState.capiEnabled) {
    return res.status(204).end();
  }

  const eventId = sanitizeInput(req.body.eventId);
  const pageUrl = sanitizeInput(req.body.pageUrl);
  const metaFbp = sanitizeInput(req.body.metaFbp);
  const metaFbc = sanitizeInput(req.body.metaFbc);

  if (!eventId || !pageUrl) {
    return res.status(204).end();
  }

  try {
    await sendMetaEvent({
      req,
      eventName: "PageView",
      eventId,
      eventSourceUrl: pageUrl,
      tracking: {
        fbp: metaFbp,
        fbc: metaFbc,
      },
    });
  } catch (error) {
    console.error("Meta page view tracking error", {
      message: error.message,
    });
  }

  return res.status(204).end();
});

app.get("/api/files/:storedName", async (req, res) => {
  const { storedName } = req.params;
  const { expires, signature } = req.query;

  if (!storageService.isValidFileAccess(storedName, expires, signature)) {
    return res.status(403).json({ message: "Доступ до файлу заборонено." });
  }

  const fileRecord = await storageService.getFileByStoredName(storedName);
  if (!fileRecord) {
    return res.status(404).json({ message: "Файл не знайдено." });
  }

  return res.download(fileRecord.path, fileRecord.storedName);
});

app.post("/api/leads", leadRateLimiter, upload.single("file"), async (req, res) => {
  let storedFile = null;

  try {
    const payload = normalizeLeadPayload(req.body, req.file);
    const validationMessage = validateLeadPayload(payload, req.file);

    if (validationMessage) {
      await cleanupTempFile(req.file);
      return res.status(400).json({
        success: false,
        message: validationMessage,
      });
    }

    storedFile = await storageService.saveFile(req.file);
    const fileUrl = storageService.getFileUrl(storedFile);
    const leadId = await createCrmItem(payload, fileUrl);

    try {
      await sendMetaEvent({
        req,
        eventName: "Lead",
        eventId: payload.metaEventId || `lead-${leadId}-${Date.now()}`,
        eventSourceUrl: payload.pageUrl || process.env.APP_BASE_URL || "",
        payload,
        tracking: {
          fbp: payload.metaFbp,
          fbc: payload.metaFbc,
        },
        fileUrl,
      });
    } catch (metaError) {
      console.error("Meta lead tracking error", {
        leadId,
        message: metaError.message,
      });
    }

    return res.json({
      success: true,
      message: "Заявку успішно надіслано",
      leadId,
      metaEventId: payload.metaEventId || "",
    });
  } catch (error) {
    console.error("Lead submission error", {
      code: error.message,
      hasFile: Boolean(req.file),
      crm: getCrmConfigState(),
    });

    if (storedFile) {
      await storageService.deleteFile(storedFile);
    } else {
      await cleanupTempFile(req.file);
    }

    if (
      error.message === "CRM_NOT_CONFIGURED" ||
      error.message === "CRM_NOT_CONFIGURED_API_KEY" ||
      error.message === "CRM_NOT_CONFIGURED_SOURCE_ID" ||
      error.message === "CRM_PROVIDER_SETUP_REQUIRED"
    ) {
      return res.status(500).json({
        success: false,
        message: "Інтеграція з CRM ще не налаштована.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Не вдалося надіслати заявку. Спробуйте ще раз трохи пізніше.",
    });
  }
});

app.get("/api/captcha-config", (_req, res) => {
  res.json({
    enabled: false,
    provider: "",
    siteKey: "",
  });
});

app.use((error, req, res, _next) => {
  cleanupTempFile(req.file);
  console.error("Request error", {
    route: req?.url,
    code: error?.code || "UNKNOWN",
    message: error?.message || "Unknown error",
  });

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: `Файл перевищує дозволений розмір ${maxFileSizeMb} МБ.`,
    });
  }

  return res.status(400).json({
    success: false,
    message: error.message === "CORS origin denied" ? "Доступ заборонено." : "Помилка обробки запиту.",
  });
});

function startServer(port = Number(process.env.PORT || 3000)) {
  return app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
