const $ = (sel) => document.querySelector(sel);

const dropZone = $("#drop-zone");
const fileInput = $("#file-input");
const previewArea = $("#preview-area");
const previewGrid = $("#preview-grid");
const previewCount = $("#preview-count");
const uploadSection = $("#upload-section");
const loadingSection = $("#loading-section");
const loadingSub = $("#loading-sub");
const errorSection = $("#error-section");
const errorMessage = $("#error-message");
const resultsSection = $("#results-section");

const MAX_FILES = 10;
const MAX_SIZE = 20 * 1024 * 1024;

let selectedFiles = [];
let objectUrls = [];
let loadingTimer = null;

// --- ابزارهای فارسی‌سازی ---

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function faNum(value) {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

const CATEGORY_FA = {
  dairy: "لبنیات",
  produce: "میوه و سبزیجات",
  meat: "گوشت و پروتئین",
  grain: "غلات و نان",
  condiment: "چاشنی و ادویه",
  beverage: "نوشیدنی",
  other: "سایر",
};

const DIFFICULTY_FA = {
  easy: "آسان",
  medium: "متوسط",
  hard: "سخت",
};

function catFa(cat) {
  if (!cat) return "";
  const key = String(cat).trim().toLowerCase();
  return CATEGORY_FA[key] || cat;
}

function diffFa(diff) {
  if (!diff) return "";
  const key = String(diff).trim().toLowerCase();
  return DIFFICULTY_FA[key] || diff;
}

// زمان‌های انگلیسی احتمالی را به فارسی برمی‌گرداند
function timeFa(t) {
  if (!t) return "";
  let s = String(t).trim();
  s = s
    .replace(/\bhours?\b/gi, "ساعت")
    .replace(/\bhrs?\b/gi, "ساعت")
    .replace(/\bminutes?\b/gi, "دقیقه")
    .replace(/\bmins?\b/gi, "دقیقه")
    .replace(/\bmin\b/gi, "دقیقه");
  return faNum(s);
}

const LOADING_MESSAGES = [
  "کارآگاه داره سرنخ‌ها رو بررسی می‌کنه؛ چند لحظه صبر کن.",
  "طبقه‌های یخچال زیر ذره‌بین رفتن…",
  "مواد اولیه دسته‌بندی می‌شن…",
  "داریم بین غذاهای ایرانی بهترین گزینه‌ها رو انتخاب می‌کنیم…",
  "دستور پخت‌ها آماده می‌شن…",
];

// --- مدیریت بارگذاری فایل ---

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  addFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", (e) => {
  addFiles(e.target.files);
  fileInput.value = "";
});

$("#add-more-btn").addEventListener("click", () => fileInput.click());
$("#browse-btn").addEventListener("click", () => fileInput.click());

// --- دوربین گوشی ---
const cameraInput = $("#camera-input");

cameraInput.addEventListener("change", (e) => {
  addFiles(e.target.files);
  cameraInput.value = "";
});

$("#camera-btn").addEventListener("click", () => cameraInput.click());
$("#add-camera-btn").addEventListener("click", () => cameraInput.click());

function addFiles(fileList) {
  const problems = [];

  for (const file of fileList) {
    if (!file.type.startsWith("image/")) {
      problems.push(`«${file.name}» عکس نیست و رد شد.`);
      continue;
    }
    if (file.size > MAX_SIZE) {
      problems.push(`«${file.name}» بیشتر از ۲۰ مگابایته و رد شد.`);
      continue;
    }
    if (selectedFiles.some((f) => f.name === file.name && f.size === file.size)) continue;
    if (selectedFiles.length >= MAX_FILES) {
      problems.push(`حداکثر ${faNum(MAX_FILES)} عکس می‌تونی انتخاب کنی.`);
      break;
    }
    selectedFiles.push(file);
  }

  renderPreviews();

  if (problems.length > 0) {
    showToast(problems[0]);
  }
}

function renderPreviews() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
  previewGrid.innerHTML = "";

  selectedFiles.forEach((file, i) => {
    const div = document.createElement("div");
    div.className = "preview-item";

    const img = document.createElement("img");
    const url = URL.createObjectURL(file);
    objectUrls.push(url);
    img.src = url;
    img.alt = file.name;
    div.appendChild(img);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preview-remove";
    btn.textContent = "×";
    btn.title = "حذف این عکس";
    btn.setAttribute("aria-label", "حذف این عکس");
    btn.onclick = () => {
      selectedFiles.splice(i, 1);
      renderPreviews();
    };
    div.appendChild(btn);

    previewGrid.appendChild(div);
  });

  previewCount.textContent = selectedFiles.length
    ? `${faNum(selectedFiles.length)} عکس`
    : "";

  if (selectedFiles.length > 0) {
    dropZone.classList.add("hidden");
    previewArea.classList.remove("hidden");
  } else {
    dropZone.classList.remove("hidden");
    previewArea.classList.add("hidden");
  }
}

// --- تحلیل ---

$("#analyze-btn").addEventListener("click", analyze);
$("#retry-btn").addEventListener("click", resetToUpload);
$("#new-analysis-btn").addEventListener("click", resetToUpload);
$("#clear-btn").addEventListener("click", () => {
  selectedFiles = [];
  renderPreviews();
});

async function analyze() {
  if (selectedFiles.length === 0) return;

  showSection("loading");
  startLoadingMessages();

  const formData = new FormData();
  selectedFiles.forEach((f) => formData.append("images", f));

  try {
    const res = await fetch("/api/analyze", { method: "POST", body: formData });

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("پاسخ سرور قابل خواندن نبود. لطفاً دوباره تلاش کن.");
    }

    if (!res.ok) {
      throw new Error(data.error || `سرور با کد ${faNum(res.status)} پاسخ داد.`);
    }

    renderResults(data);
    showSection("results");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    errorMessage.textContent =
      err.message || "در بررسی عکس‌های یخچال مشکلی پیش آمد.";
    showSection("error");
  } finally {
    stopLoadingMessages();
  }
}

function startLoadingMessages() {
  let i = 0;
  loadingSub.textContent = LOADING_MESSAGES[0];
  loadingTimer = setInterval(() => {
    i = (i + 1) % LOADING_MESSAGES.length;
    loadingSub.textContent = LOADING_MESSAGES[i];
  }, 3200);
}

function stopLoadingMessages() {
  if (loadingTimer) clearInterval(loadingTimer);
  loadingTimer = null;
}

// --- نمایش نتایج ---

function renderResults(data) {
  // مواد شناسایی‌شده
  const grid = $("#ingredients-grid");
  grid.innerHTML = "";

  const ingredients = data.ingredients || [];
  const useSoon = data.useSoon || [];
  const useSoonSet = new Set(
    useSoon.filter(Boolean).map((s) => String(s).trim().toLowerCase())
  );

  ingredients.forEach((ing, idx) => {
    const chip = document.createElement("div");
    chip.className = "ingredient-chip";
    chip.style.animationDelay = `${Math.min(idx * 40, 500)}ms`;

    const name = ing.name || "نامشخص";
    const isSoon =
      useSoonSet.has(String(name).trim().toLowerCase()) || !!ing.perishable;
    if (isSoon) chip.classList.add("use-soon");

    const conf = typeof ing.confidence === "number" ? ing.confidence : 0.5;
    const confClass = conf >= 0.7 ? "high" : conf >= 0.4 ? "mid" : "low";
    const pct = Math.round(Math.max(0, Math.min(1, conf)) * 100);

    const top = document.createElement("div");
    top.className = "chip-top";
    top.innerHTML = `
      <span class="chip-name">${esc(name)}</span>
      <span class="chip-cat">${esc(catFa(ing.category))}</span>
    `;
    chip.appendChild(top);

    const bar = document.createElement("span");
    bar.className = "confidence-bar";
    bar.innerHTML = `<span class="confidence-fill confidence-${confClass}" style="width:${pct}%"></span>`;
    chip.appendChild(bar);

    if (isSoon) {
      const flag = document.createElement("span");
      flag.className = "chip-flag";
      flag.textContent = "مصرف فوری";
      chip.appendChild(flag);
    }

    const tip = [];
    if (ing.notes) tip.push(ing.notes);
    tip.push(`میزان اطمینان: ${faNum(pct)}٪`);
    chip.title = tip.join(" — ");

    grid.appendChild(chip);
  });

  if (ingredients.length === 0) {
    grid.innerHTML = `<p class="loading-sub">هیچ ماده‌ای در عکس‌ها تشخیص داده نشد. عکس واضح‌تر با نور بهتر بگیر.</p>`;
  }

  $("#ingredients-count").textContent = ingredients.length
    ? `${faNum(ingredients.length)} مورد`
    : "";

  // هشدار مصرف فوری
  const banner = $("#use-soon-banner");
  if (useSoon.length > 0) {
    banner.classList.remove("hidden");
    $("#use-soon-list").textContent = useSoon.join("، ");
  } else {
    banner.classList.add("hidden");
  }

  // غذاها
  const recipesGrid = $("#recipes-grid");
  recipesGrid.innerHTML = "";

  const recipes = data.recipes || [];

  recipes.forEach((recipe, idx) => {
    const card = document.createElement("div");
    card.className = "recipe-card";
    card.style.animationDelay = `${Math.min(idx * 70, 500)}ms`;

    const matchPct = Math.round(
      Math.max(0, Math.min(1, recipe.matchScore || 0)) * 100
    );

    const available = recipe.availableIngredients || [];
    const missing = recipe.missingIngredients || [];
    const steps = recipe.instructions || [];

    const metaParts = [
      `<span class="recipe-badge match">${faNum(matchPct)}٪ تطابق</span>`,
    ];
    if (recipe.estimatedTime) {
      metaParts.push(`<span class="recipe-badge">⏱ ${esc(timeFa(recipe.estimatedTime))}</span>`);
    }
    if (recipe.difficulty) {
      metaParts.push(`<span class="recipe-badge">سطح: ${esc(diffFa(recipe.difficulty))}</span>`);
    }

    card.innerHTML = `
      <div class="recipe-header">
        <div class="recipe-name">${esc(recipe.name || "غذای بی‌نام")}</div>
        <div class="recipe-meta">${metaParts.join("")}</div>
      </div>
      <p class="recipe-desc">${esc(recipe.description || "")}</p>
      <div class="recipe-columns">
        <div class="recipe-col available">
          <h4>داری</h4>
          <ul>${
            available.length
              ? available.map((i) => `<li>${esc(i)}</li>`).join("")
              : `<li class="empty">—</li>`
          }</ul>
        </div>
        <div class="recipe-col missing">
          <h4>لازم داری</h4>
          <ul>${
            missing.length
              ? missing.map((i) => `<li>${esc(i)}</li>`).join("")
              : `<li class="empty">چیزی کم نداری</li>`
          }</ul>
        </div>
      </div>
      <div class="recipe-instructions">
        <h4>مراحل پخت</h4>
        <ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      </div>
    `;
    recipesGrid.appendChild(card);
  });

  if (recipes.length === 0) {
    recipesGrid.innerHTML = `<p class="loading-sub">با مواد شناسایی‌شده پیشنهاد مطمئنی پیدا نشد. عکس بیشتری از کابینت و فریزر اضافه کن.</p>`;
  }

  $("#recipes-count").textContent = recipes.length
    ? `${faNum(recipes.length)} پیشنهاد`
    : "";

  // یادداشت تحلیل
  const notesCard = $("#analysis-notes");
  if (data.analysisNotes) {
    notesCard.classList.remove("hidden");
    $("#notes-text").textContent = data.analysisNotes;
  } else {
    notesCard.classList.add("hidden");
  }
}

// --- کمکی‌های رابط کاربری ---

function showSection(name) {
  uploadSection.classList.add("hidden");
  loadingSection.classList.add("hidden");
  errorSection.classList.add("hidden");
  resultsSection.classList.add("hidden");

  switch (name) {
    case "upload":
      uploadSection.classList.remove("hidden");
      break;
    case "loading":
      loadingSection.classList.remove("hidden");
      break;
    case "error":
      errorSection.classList.remove("hidden");
      break;
    case "results":
      resultsSection.classList.remove("hidden");
      break;
  }
}

function resetToUpload() {
  showSection("upload");
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str === 0 ? "0" : str || "";
  return d.innerHTML;
}

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.setAttribute("role", "status");
    Object.assign(toast.style, {
      position: "fixed",
      insetInlineStart: "50%",
      transform: "translateX(-50%)",
      insetBlockEnd: "24px",
      background: "rgba(20, 16, 14, 0.92)",
      border: "1px solid rgba(255, 179, 64, 0.4)",
      color: "#f5efe8",
      padding: "12px 20px",
      borderRadius: "999px",
      fontSize: "14px",
      zIndex: "50",
      backdropFilter: "blur(10px)",
      boxShadow: "0 18px 40px -18px rgba(0,0,0,0.9)",
      transition: "opacity .3s ease",
    });
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.style.opacity = "0";
  }, 4000);
}

// بررسی سلامت سرور در بارگذاری اولیه
fetch("/api/health")
  .then((r) => r.json())
  .then((d) => {
    if (!d.hasApiKey) {
      showToast("کلید GEMINI_API_KEY روی سرور تنظیم نشده؛ تحلیل انجام نمی‌شه.");
      console.warn("GEMINI_API_KEY not set on server");
    }
  })
  .catch(() => {});

// --- نصب به‌عنوان اپ (PWA) ---

let deferredPrompt = null;
const installBtn = $("#install-btn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove("hidden");
});

installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) {
    showToast("برای نصب، از منوی مرورگر گزینه «افزودن به صفحه اصلی» را بزن.");
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add("hidden");
  if (outcome === "accepted") showToast("نصب شد! آیکون اپ روی صفحه اصلی گوشی است.");
});

window.addEventListener("appinstalled", () => {
  installBtn.classList.add("hidden");
  deferredPrompt = null;
});

// در حالت نصب‌شده دکمه نصب لازم نیست
if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
  installBtn.classList.add("hidden");
}

// ثبت سرویس‌ورکر
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("ثبت سرویس‌ورکر ناموفق بود:", err);
    });
  });
}
