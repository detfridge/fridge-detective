const crypto = require("crypto");
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const fs = require("fs");
const path0 = require("path");

// خواندن ساده فایل .env (بدون نیاز به پکیج اضافه)
(() => {
  const envPath = path0.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
})();

const express = require("express");
const multer = require("multer");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

const MAX_IMAGES = 15;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("فقط فایل تصویری قابل قبول است"), false);
  },
});

// سرویس‌ورکر و منیفست نباید کش سرسختانه شوند
app.use((req, res, next) => {
  if (req.path === "/sw.js" || req.path === "/manifest.webmanifest") {
    res.setHeader("Cache-Control", "no-cache");
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", 1);

// روی هاست ابری: هدایت اجباری به HTTPS + HSTS
app.use((req, res, next) => {
  const proto = req.headers["x-forwarded-proto"];
  if (proto && proto !== "https") {
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  }
  if (proto === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(express.json());

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// زنجیره مدل: اگر مدلی پشتیبانی نشد یا سهمیه پر بود، مدل بعدی امتحان می‌شود
const MODEL_CHAIN = [
  ...new Set(
    (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL.trim()] : []).concat([
      "gemini-2.5-flash",
      "gemini-flash-latest",
      "gemini-2.5-flash-lite",
      "gemini-flash-lite-latest",
    ])
  ),
];

const ANALYSIS_PROMPT = `تو «کارآگاه یخچال» هستی؛ متخصص تشخیص مواد غذایی از روی عکس و پیشنهاد غذا برای یک کاربر ایرانی.

عکس‌های داده‌شده را تحلیل کن و پاسخ را فقط به صورت JSON با همین ساختار برگردان:

{
  "ingredients": [
    {
      "name": "نام ماده غذایی به فارسی",
      "category": "dairy|produce|meat|grain|condiment|beverage|other",
      "perishable": true/false,
      "confidence": 0.0-1.0,
      "notes": "توضیح کوتاه فارسی در صورت لزوم (مثلا: تازه به نظر می‌رسد، بهتر است زودتر مصرف شود)"
    }
  ],
  "recipes": [
    {
      "name": "نام غذا به فارسی",
      "description": "توضیح یک‌خطی فارسی",
      "availableIngredients": ["ماده‌ای که کاربر دارد"],
      "missingIngredients": ["ماده‌ای که باید تهیه کند"],
      "instructions": ["مرحله اول", "مرحله دوم", "مرحله سوم"],
      "matchScore": 0.0-1.0,
      "estimatedTime": "۳۰ دقیقه",
      "difficulty": "easy|medium|hard"
    }
  ],
  "useSoon": ["نام مواد فارسی که باید زودتر مصرف شوند"],
  "analysisNotes": "توضیح فارسی درباره کیفیت عکس یا موارد نامطمئن"
}

قواعد مهم:
- همه خروجی‌های متنی (نام مواد، نام غذا، توضیح، مراحل پخت، یادداشت‌ها) باید فارسی روان و محاوره‌ای-مودبانه باشند. از انگلیسی استفاده نکن. فقط مقدارهای فیلد "category" و "difficulty" به همان کلیدواژه انگلیسی مشخص‌شده بمانند.
- فقط چیزهایی را نام ببر که واقعاً در عکس دیده می‌شوند.
- اگر موردی تار یا نامشخص است، confidence را کمتر از ۰٫۵ بگذار و در notes به نامطمئن بودن اشاره کن.
- برای مواد فسادپذیر، فوریت مصرف را از ظاهرشان تخمین بزن (تازه یا کمی مانده).
- بین ۳ تا ۵ غذای واقع‌بینانه پیشنهاد بده.
- اولویت اول: غذاهای ایرانی و خانگی (مثل خورش‌ها، کوکو، آش، کتلت، پلوهای مخلوط، املت، میرزاقاسمی و مانند این‌ها). اگر مواد موجود مناسب غذای ایرانی نبود یا تنوع لازم بود، غذاهای بین‌المللی ساده هم پیشنهاد بده.
- غذاهایی را در اولویت بگذار که بیشترین استفاده را از مواد موجود می‌کنند و کمترین خرید را لازم دارند.
- موادی که فسادپذیرند و باید زودتر مصرف شوند را در useSoon بیاور.
- ادعای فاسد بودن نکن، مگر شاهد تصویری روشنی وجود داشته باشد.
- زمان‌ها و اعداد داخل متن را با ارقام فارسی بنویس (مثلا «۴۵ دقیقه»).
- فقط JSON معتبر برگردان؛ بدون بلوک کد مارک‌داون و بدون هیچ متن اضافه.`;

// خطاهایی که ارزش امتحان مدل بعدی را دارند
function shouldTryNextModel(err) {
  const msg = String((err && err.message) || err || "").toLowerCase();
  const status = (err && (err.status || err.code)) || 0;

  // خطای کلید/دسترسی با تغییر مدل حل نمی‌شود
  if (/api_key_invalid|api key not valid|permission_denied|unauthenticated/.test(msg)) {
    return false;
  }

  return (
    status === 404 ||
    status === 429 ||
    msg.includes("not found") ||
    msg.includes("not supported") ||
    msg.includes("unsupported") ||
    msg.includes("deprecated") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable")
  );
}

async function generateWithFallback(parts) {
  let lastErr = null;
  for (const model of MODEL_CHAIN) {
    try {
      const response = await genai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
      });
      if (model !== MODEL_CHAIN[0]) {
        console.log(`  ↪ مدل جایگزین استفاده شد: ${model}`);
      }
      return { response, model };
    } catch (err) {
      lastErr = err;
      console.error(`مدل ${model} ناموفق بود:`, err.message);
      if (!shouldTryNextModel(err)) break;
    }
  }
  throw lastErr || new Error("هیچ مدلی پاسخ نداد");
}

// قفل دسترسی اختیاری: اگر ACCESS_CODE ست شود، تحلیل بدون رمز انجام نمی‌شود
const ACCESS_CODE = (process.env.ACCESS_CODE || "").trim();

function timingSafeEq(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

// محدودیت نرخ ساده در حافظه: جلوگیری از مصرف بی‌رویه سهمیه API وقتی اپ روی اینترنت است
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = Number(process.env.RATE_LIMIT_PER_HOUR || 30);
const hits = new Map();

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const faNum = (v) => String(v).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 500) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  }
  return arr.length > RATE_MAX;
}

app.post("/api/analyze", upload.array("images", MAX_IMAGES), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res
        .status(500)
        .json({ error: "کلید GEMINI_API_KEY روی سرور تنظیم نشده است." });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "هیچ عکسی ارسال نشد." });
    }

    if (ACCESS_CODE) {
      const given = req.headers["x-access-code"] || req.body?.accessCode || "";
      if (!timingSafeEq(given, ACCESS_CODE)) {
        return res.status(401).json({ error: "رمز دسترسی درست نیست." });
      }
    }

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip;
    if (rateLimited(ip)) {
      return res.status(429).json({
        error: `سقف ${faNum(RATE_MAX)} درخواست در ساعت پر شده. یک ساعت دیگر دوباره تلاش کن.`,
      });
    }

    const parts = [];
    for (const file of req.files) {
      parts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString("base64"),
        },
      });
    }
    parts.push({ text: ANALYSIS_PROMPT });

    const { response } = await generateWithFallback(parts);

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res
        .status(500)
        .json({ error: "پاسخ هوش مصنوعی قابل پردازش نبود. دوباره تلاش کن." });
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      return res
        .status(500)
        .json({ error: "ساختار پاسخ هوش مصنوعی معتبر نبود. دوباره تلاش کن." });
    }

    res.json(result);
  } catch (err) {
    console.error("خطای تحلیل:", err);
    const msg = String(err.message || "");
    let userMsg = "تحلیل عکس‌ها انجام نشد.";
    if (/quota|RESOURCE_EXHAUSTED|rate limit/i.test(msg)) {
      userMsg = "سهمیه رایگان API پر شده یا درخواست‌ها زیاد بوده؛ چند دقیقه بعد دوباره تلاش کن.";
    } else if (/not found|not supported|deprecated/i.test(msg)) {
      userMsg = "مدل انتخاب‌شده پشتیبانی نمی‌شود. متغیر GEMINI_MODEL را بررسی کن.";
    } else if (/API key|API_KEY|PERMISSION_DENIED|401|403/i.test(msg)) {
      userMsg = "کلید API معتبر نیست یا دسترسی ندارد.";
    } else if (/fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(msg)) {
      userMsg = "اتصال به سرور گوگل برقرار نشد. اتصال اینترنت یا پروکسی را بررسی کن.";
    }
    res.status(500).json({ error: userMsg, detail: msg });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY,
    requiresCode: !!ACCESS_CODE,
    models: MODEL_CHAIN,
  });
});

// خطاهای multer و سایر خطاهای میان‌راهی به فارسی
app.use((err, req, res, next) => {
  if (!err) return next();
  console.error("خطای سرور:", err.message);
  let msg = err.message || "خطای نامشخص سرور";
  if (err.code === "LIMIT_FILE_SIZE") msg = "حجم عکس بیشتر از ۲۰ مگابایت است.";
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE")
    msg = `حداکثر ${faNum(MAX_IMAGES)} عکس مجاز است.`;
  res.status(400).json({ error: msg });
});

const os = require("os");

function lanIPs() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

// روی 0.0.0.0 گوش می‌دهد تا از گوشی داخل همان وای‌فای هم قابل دسترسی باشد
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  🕵️  کارآگاه یخچال در حال اجراست`);
  console.log(`     روی همین کامپیوتر:  http://localhost:${PORT}`);
  for (const ip of lanIPs()) {
    console.log(`     از گوشی (وای‌فای):   http://${ip}:${PORT}`);
  }
  console.log(`\n  مدل اصلی: ${MODEL_CHAIN[0]}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log("  ⚠️  GEMINI_API_KEY تنظیم نشده است؛ درخواست‌های تحلیل خطا می‌دهند.");
  }
  console.log("");
});
