const body = document.body;
const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");
const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');
const form = document.getElementById("quote-form");
const formStatus = document.getElementById("form-status");
const reveals = document.querySelectorAll(".reveal");
const materialTabs = document.querySelectorAll(".material-tab");
const materialPanels = document.querySelectorAll(".material-panel");
const fileInput = document.getElementById("attachment");
const fileDropzone = document.getElementById("file-dropzone");
const fileMeta = document.getElementById("file-meta");
const fileName = document.getElementById("file-name");
const fileSize = document.getElementById("file-size");
const fileRemove = document.getElementById("file-remove");
const fileError = document.getElementById("file-error");
const fileHint = document.getElementById("file-hint");
const submitButton = document.getElementById("submit-button");
const fileProgress = document.getElementById("file-progress");
const fileProgressBar = document.getElementById("file-progress-bar");
const currentYearNode = document.getElementById("current-year");
const footerContactsNode = document.getElementById("footer-contacts");
const mobileStickyCta = document.querySelector(".mobile-sticky-cta");
const quoteSection = document.getElementById("quote");
const autoplayVideos = document.querySelectorAll("[data-autoplay-on-view]");

const allowedFileExtensions = [".stl", ".3mf", ".step", ".stp", ".obj", ".zip"];
const defaultMaxFileSizeMb = 50;
let isSubmitting = false;
let uploadProgressTimer = null;
let metaRuntimeConfig = {
  enabled: false,
  pixelId: "",
  capiEnabled: false,
};
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const siteConfig = {
  contacts: {
    email: "",
    phone: "0993252686",
    socialLinks: [
      { label: "Instagram", href: "#" },
      { label: "Facebook", href: "#" },
    ],
  },
};

async function syncUploadSettings() {
  try {
    const response = await fetch("/health");
    if (!response.ok) {
      return;
    }

    const result = await response.json();
    const maxFileSizeMb = Number(result.maxFileSizeMb);

    if (Number.isFinite(maxFileSizeMb) && maxFileSizeMb > 0) {
      form.dataset.maxFileSizeMb = String(maxFileSizeMb);
      if (fileHint) {
        fileHint.textContent = `Підтримуються STL, 3MF, STEP, STP, OBJ, ZIP. Максимальний розмір: ${maxFileSizeMb} МБ.`;
      }
    }

    metaRuntimeConfig = {
      enabled: Boolean(result.meta?.enabled && result.meta?.pixelId),
      pixelId: String(result.meta?.pixelId || ""),
      capiEnabled: Boolean(result.meta?.capiEnabled),
    };

    initMetaTracking();
  } catch (_error) {
    // If health settings are unavailable, the UI falls back to its default limit.
  }
}

function getCookieValue(name) {
  const escapedName = name.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function generateMetaEventId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureMetaPixelStub() {
  if (window.fbq) {
    return;
  }

  window.fbq = function fbqProxy() {
    if (window.fbq.callMethod) {
      window.fbq.callMethod.apply(window.fbq, arguments);
      return;
    }

    window.fbq.queue.push(arguments);
  };
  window._fbq = window.fbq;
  window.fbq.push = window.fbq;
  window.fbq.loaded = true;
  window.fbq.version = "2.0";
  window.fbq.queue = [];
}

function initMetaTracking() {
  if (!metaRuntimeConfig.enabled || document.documentElement.dataset.metaInitialized === "true") {
    return;
  }

  ensureMetaPixelStub();

  if (!document.getElementById("meta-pixel-script")) {
    const script = document.createElement("script");
    script.id = "meta-pixel-script";
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.append(script);
  }

  window.fbq("init", metaRuntimeConfig.pixelId);

  const pageViewEventId = generateMetaEventId("pageview");
  window.fbq("track", "PageView", {}, { eventID: pageViewEventId });

  if (metaRuntimeConfig.capiEnabled) {
    fetch("/api/tracking/page-view", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventId: pageViewEventId,
        pageUrl: window.location.href,
        metaFbp: getCookieValue("_fbp"),
        metaFbc: getCookieValue("_fbc"),
      }),
    }).catch(() => {});
  }

  document.documentElement.dataset.metaInitialized = "true";
}

function closeMenu() {
  if (!menuToggle || !siteNav) {
    return;
  }

  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Відкрити меню");
  siteNav.classList.remove("is-open");
  body.classList.remove("menu-open");
}

function openMenu() {
  if (!menuToggle || !siteNav) {
    return;
  }

  menuToggle.setAttribute("aria-expanded", "true");
  menuToggle.setAttribute("aria-label", "Закрити меню");
  siteNav.classList.add("is-open");
  body.classList.add("menu-open");
}

if (menuToggle && siteNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.contains("is-open");
    if (isOpen) {
      closeMenu();
      return;
    }
    openMenu();
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 820) {
      closeMenu();
    }
  });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    if (!href || href === "#") {
      return;
    }

    const target = document.querySelector(href);
    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: "auto", block: "start" });
  });
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 }
);

if (!prefersReducedMotion) {
  reveals.forEach((item) => revealObserver.observe(item));
} else {
  reveals.forEach((item) => item.classList.add("is-visible"));
}

if (materialTabs.length && materialPanels.length) {
  materialTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const material = tab.dataset.material;

      materialTabs.forEach((item) => {
        item.classList.toggle("is-active", item === tab);
        item.setAttribute("aria-selected", String(item === tab));
      });

      materialPanels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.panel === material);
      });
    });
  });
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 Б";
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
  }

  return `${Math.round(bytes / 1024)} КБ`;
}

function setFieldError(field, message) {
  if (!field) {
    return;
  }

  const wrapper = field.closest("label") || field.closest(".file-upload-field");
  const errorNode = wrapper?.querySelector(".field-error") || (field === fileInput ? fileError : null);

  if (wrapper) {
    wrapper.classList.toggle("field-has-error", Boolean(message));
  }

  if (field === fileInput && fileDropzone) {
    fileDropzone.classList.toggle("has-error", Boolean(message));
  }

  if (errorNode) {
    errorNode.textContent = message || "";
  }
}

function clearFormErrors() {
  form?.querySelectorAll(".field-has-error").forEach((item) => item.classList.remove("field-has-error"));
  form?.querySelectorAll(".field-error").forEach((item) => {
    item.textContent = "";
  });
  fileDropzone?.classList.remove("has-error");
}

function getSelectedFile() {
  return fileInput?.files?.[0] || null;
}

function syncFileUi() {
  const file = getSelectedFile();
  if (!fileMeta || !fileName || !fileSize) {
    return;
  }

  if (!file) {
    fileMeta.hidden = true;
    fileName.textContent = "Файл не вибрано";
    fileSize.textContent = "";
    if (fileProgress) {
      fileProgress.hidden = true;
      fileProgressBar.style.width = "0%";
    }
    return;
  }

  fileMeta.hidden = false;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
}

function animateFileProgress() {
  if (!fileProgress || !fileProgressBar) {
    return;
  }

  fileProgress.hidden = false;
  fileProgressBar.style.width = "0%";

  if (prefersReducedMotion) {
    fileProgressBar.style.width = "100%";
    return;
  }

  clearInterval(uploadProgressTimer);
  let progress = 0;
  uploadProgressTimer = window.setInterval(() => {
    progress = Math.min(progress + 12, 100);
    fileProgressBar.style.width = `${progress}%`;
    if (progress >= 100) {
      clearInterval(uploadProgressTimer);
    }
  }, 40);
}

function validateFile() {
  const file = getSelectedFile();
  if (!file) {
    setFieldError(fileInput, "");
    return true;
  }

  const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
  if (!allowedFileExtensions.includes(extension)) {
    setFieldError(fileInput, "Допустимі лише файли STL, 3MF, STEP, STP, OBJ або ZIP.");
    return false;
  }

  const maxSizeMb = Number(form?.dataset.maxFileSizeMb || defaultMaxFileSizeMb);
  if (file.size > maxSizeMb * 1024 * 1024) {
    setFieldError(fileInput, `Файл перевищує дозволений розмір ${maxSizeMb} МБ.`);
    return false;
  }

  setFieldError(fileInput, "");
  return true;
}

function validatePhone(value) {
  return /^\+?[0-9\s()\-]{9,20}$/.test(value.trim());
}

function validateForm() {
  if (!form) {
    return false;
  }

  clearFormErrors();

  let isValid = true;
  const nameField = form.elements.namedItem("fullName");
  const phoneField = form.elements.namedItem("phone");
  const quantityField = form.elements.namedItem("quantity");
  const consentField = form.elements.namedItem("privacyAccepted");

  if (!validateFile()) {
    isValid = false;
  }

  if (!(nameField instanceof HTMLInputElement) || !nameField.value.trim()) {
    setFieldError(nameField, "Вкажіть ім'я та прізвище.");
    isValid = false;
  }

  if (!(phoneField instanceof HTMLInputElement) || !phoneField.value.trim()) {
    setFieldError(phoneField, "Вкажіть номер телефону.");
    isValid = false;
  } else if (!validatePhone(phoneField.value)) {
    setFieldError(phoneField, "Вкажіть коректний телефон у міжнародному або українському форматі.");
    isValid = false;
  }

  if (quantityField instanceof HTMLInputElement && quantityField.value && Number(quantityField.value) < 1) {
    setFieldError(quantityField, "Кількість деталей має бути більшою за нуль.");
    isValid = false;
  }

  if (consentField instanceof RadioNodeList ? !consentField.value : consentField instanceof HTMLInputElement && !consentField.checked) {
    const consentError = document.getElementById("consent-error");
    if (consentError) {
      consentError.textContent = "Потрібна згода з обробкою персональних даних.";
    }
    isValid = false;
  }

  return isValid;
}

if (fileInput && fileDropzone && fileRemove) {
  fileInput.addEventListener("change", () => {
    syncFileUi();
    animateFileProgress();
    validateFile();
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    fileDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      fileDropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    fileDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      fileDropzone.classList.remove("is-dragover");
    });
  });

  fileDropzone.addEventListener("drop", (event) => {
    const droppedFiles = event.dataTransfer?.files;
    if (!droppedFiles?.length) {
      return;
    }

    fileInput.files = droppedFiles;
    syncFileUi();
    animateFileProgress();
    validateFile();
  });

  fileDropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });

  fileRemove.addEventListener("click", () => {
    fileInput.value = "";
    syncFileUi();
    if (fileProgressBar) {
      fileProgressBar.style.width = "0%";
    }
    setFieldError(fileInput, "");
  });
}

if (currentYearNode) {
  currentYearNode.textContent = String(new Date().getFullYear());
}

if (footerContactsNode) {
  const { email, phone, socialLinks } = siteConfig.contacts;
  footerContactsNode.innerHTML = `
    <strong>Контакти</strong>
    ${email ? `<a class="footer-contact-link" href="mailto:${email}">${email}</a>` : ""}
    ${phone ? `<a class="footer-contact-link" href="tel:${phone.replace(/[^+\d]/g, "")}">${phone}</a>` : ""}
    <div class="footer-socials">
      <strong>Соціальні мережі</strong>
      ${socialLinks.map((link) => `<a href="${link.href}" target="_blank" rel="noopener noreferrer">${link.label}</a>`).join("")}
    </div>
  `;
}

if (mobileStickyCta && quoteSection && !prefersReducedMotion) {
  const stickyCtaObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        mobileStickyCta.style.opacity = entry.isIntersecting ? "0" : "1";
        mobileStickyCta.style.pointerEvents = entry.isIntersecting ? "none" : "auto";
      });
    },
    { threshold: 0.2 }
  );

  stickyCtaObserver.observe(quoteSection);
}

if (autoplayVideos.length) {
  autoplayVideos.forEach((video) => {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.addEventListener("loadeddata", () => {
      video.dataset.ready = "true";
    }, { once: true });
  });

  const videoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!(entry.target instanceof HTMLVideoElement)) {
          return;
        }

        if (entry.isIntersecting) {
          entry.target.play().catch(() => {});
          return;
        }

        entry.target.pause();
      });
    },
    { threshold: 0.35, rootMargin: "120px 0px" }
  );

  autoplayVideos.forEach((video) => videoObserver.observe(video));
}

if (form && formStatus) {
  syncUploadSettings();

  form.querySelectorAll("input, textarea, select").forEach((field) => {
    field.addEventListener("input", () => {
      const wrapper = field.closest("label");
      wrapper?.classList.remove("field-has-error");
      const errorNode = wrapper?.querySelector(".field-error");
      if (errorNode) {
        errorNode.textContent = "";
      }
      if (field instanceof HTMLInputElement && field.type === "checkbox") {
        const consentError = document.getElementById("consent-error");
        if (consentError) {
          consentError.textContent = "";
        }
      }
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    formStatus.className = "form-status full-width";

    if (!validateForm()) {
      formStatus.classList.add("is-error");
      formStatus.textContent = "Перевірте форму та виправте поля з помилками.";
      return;
    }

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
    }
    formStatus.textContent = "Надсилаємо заявку...";

    try {
      const metaLeadEventId = generateMetaEventId("lead");
      const formData = new FormData(form);
      formData.append("metaEventId", metaLeadEventId);
      formData.append("metaFbp", getCookieValue("_fbp"));
      formData.append("metaFbc", getCookieValue("_fbc"));
      formData.append("pageUrl", window.location.href);

      const response = await fetch("/api/leads", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Не вдалося надіслати заявку.");
      }

      form.reset();
      syncFileUi();
      clearFormErrors();
      if (metaRuntimeConfig.enabled && typeof window.fbq === "function") {
        window.fbq("track", "Lead", {}, { eventID: metaLeadEventId });
      }
      formStatus.classList.add("is-success");
      formStatus.textContent =
        result.message || "Дякуємо! Ми отримали вашу модель та зв'яжемося з вами після її аналізу.";
    } catch (error) {
      formStatus.classList.add("is-error");
      formStatus.textContent = error.message || "Сталася помилка. Спробуйте ще раз.";
    } finally {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}
