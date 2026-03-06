/**
 * @description KarankBridge — مدير subprocess للتواصل مع محرك Python عبر stdio JSON lines
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = resolve(
  __dirname,
  "karank_engine",
  "engine",
  "ts_bridge.py"
);

const PING_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

/** @type {"idle" | "starting" | "ready" | "dead" | "error"} */
let state = "idle";

/** @type {import("node:child_process").ChildProcess | null} */
let proc = null;

/** @type {import("node:readline").Interface | null} */
let rl = null;

/** @type {Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
const pending = new Map();

let requestCounter = 0;
let retryAttempted = false;

/**
 * التحقق من توفر Python 3.12+
 */
const checkPython = () => {
  try {
    const output = execSync("python --version", {
      encoding: "utf-8",
      timeout: 5_000,
      windowsHide: true,
    }).trim();

    const match = output.match(/Python\s+(\d+)\.(\d+)/);
    if (!match) {
      throw new Error(
        `تعذر تحديد إصدار Python. الناتج: "${output}". تأكد من وجود Python 3.12+ على PATH.`
      );
    }

    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major < 3 || (major === 3 && minor < 12)) {
      throw new Error(
        `Python ${major}.${minor} غير مدعوم. المطلوب: Python 3.12+. تأكد من تثبيت الإصدار الصحيح على PATH.`
      );
    }
  } catch (error) {
    if (
      error.code === "ENOENT" ||
      error.message.includes("not found") ||
      error.message.includes("not recognized")
    ) {
      throw new Error(
        "Python غير موجود على PATH. تأكد من تثبيت Python 3.12+ وإضافته لـ PATH.",
        { cause: error }
      );
    }
    throw error;
  }
};

/**
 * التحقق من وجود ملفات المحرك
 */
const checkEngineFiles = () => {
  if (!existsSync(ENGINE_PATH)) {
    throw new Error(
      `ملف المحرك غير موجود: ${ENGINE_PATH}. تأكد من نسخ ملفات المحرك إلى server/karank_engine/engine/.`
    );
  }
};

const nextId = () => `req-${++requestCounter}-${Date.now()}`;

/**
 * معالجة سطر JSON قادم من stdout
 */
const handleLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    console.warn("[karank-bridge] تعذر تحليل سطر JSON:", trimmed.slice(0, 200));
    return;
  }

  const id = parsed?.id;
  if (!id || !pending.has(id)) return;

  const { resolve: res, timer } = pending.get(id);
  clearTimeout(timer);
  pending.delete(id);
  res(parsed);
};

/**
 * تشغيل عملية Python
 */
const spawnProcess = () => {
  state = "starting";

  proc = spawn("python", ["-u", ENGINE_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: "1" },
  });

  rl = createInterface({ input: proc.stdout });
  rl.on("line", handleLine);

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.warn("[karank-bridge:stderr]", text);
  });

  proc.on("close", (code) => {
    const wasReady = state === "ready";
    state = "dead";
    rl = null;
    proc = null;

    // reject all pending requests
    for (const [_id, { reject: rej, timer }] of pending) {
      clearTimeout(timer);
      rej(new Error(`عملية المحرك انتهت برمز ${code}`));
    }
    pending.clear();

    if (wasReady) {
      console.warn(`[karank-bridge] العملية انتهت برمز ${code}`);
    }
  });
};

/**
 * إرسال طلب JSON وانتظار الرد
 */
const sendRequest = (payload, timeoutMs = REQUEST_TIMEOUT_MS) => {
  return new Promise((resolve, reject) => {
    if (!proc || !proc.stdin.writable) {
      reject(new Error("عملية المحرك غير نشطة"));
      return;
    }

    const id = payload.id;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`انتهت مهلة الطلب ${id} (${timeoutMs}ms)`));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timer });

    proc.stdin.write(JSON.stringify(payload) + "\n", "utf-8", (err) => {
      if (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err);
      }
    });
  });
};

/**
 * إرسال ping والتحقق من الجاهزية
 */
const ping = async () => {
  const id = nextId();
  const response = await sendRequest({ id, action: "ping" }, PING_TIMEOUT_MS);
  if (!response?.ok) {
    throw new Error("المحرك لم يُرجع ping ناجح");
  }
  return response;
};

/**
 * ضمان جاهزية البريدج — lazy spawn + ping
 */
const ensureReady = async () => {
  if (state === "ready" && proc && !proc.killed) return;

  if (state === "error") {
    throw new Error("المحرك في حالة خطأ نهائي. أعد تشغيل الخادم.");
  }

  checkPython();
  checkEngineFiles();

  spawnProcess();

  try {
    await ping();
    state = "ready";
    retryAttempted = false;
    // eslint-disable-next-line no-console
    console.log("[karank-bridge] المحرك جاهز");
  } catch (error) {
    // محاولة واحدة لإعادة التشغيل
    if (!retryAttempted) {
      retryAttempted = true;
      console.warn("[karank-bridge] فشل ping الأول، محاولة إعادة تشغيل...");

      if (proc && !proc.killed) proc.kill();
      proc = null;
      rl = null;

      spawnProcess();

      try {
        await ping();
        state = "ready";
        // eslint-disable-next-line no-console
        console.log("[karank-bridge] المحرك جاهز بعد إعادة التشغيل");
      } catch (retryError) {
        state = "error";
        if (proc && !proc.killed) proc.kill();
        proc = null;
        rl = null;
        throw new Error(
          `تعذر تشغيل المحرك بعد محاولتين. ${retryError.message}`,
          { cause: retryError }
        );
      }
    } else {
      state = "error";
      throw error;
    }
  }
};

/**
 * تحليل نص عبر المحرك
 * @param {string} text - النص العربي
 * @returns {Promise<object>} نتيجة التحليل
 */
export const parseText = async (text) => {
  await ensureReady();
  const id = nextId();
  const response = await sendRequest({
    id,
    action: "parseText",
    text,
  });

  if (!response?.ok) {
    const errMsg = response?.error?.message || "فشل تحليل النص";
    throw new Error(errMsg);
  }

  return response.result;
};

/**
 * تحليل ملف DOCX عبر المحرك
 * @param {string} docxPath - المسار المطلق لملف DOCX
 * @returns {Promise<object>} نتيجة التحليل
 */
export const parseDocx = async (docxPath) => {
  await ensureReady();
  const id = nextId();
  const response = await sendRequest({
    id,
    action: "parseDocx",
    path: docxPath,
  });

  if (!response?.ok) {
    const errMsg = response?.error?.message || "فشل تحليل DOCX";
    throw new Error(errMsg);
  }

  return response.result;
};

/**
 * إيقاف البريدج بشكل آمن
 */
export const destroy = async () => {
  if (!proc || proc.killed) {
    state = "idle";
    return;
  }

  try {
    // إرسال أمر shutdown أولاً
    const id = nextId();
    proc.stdin.write(
      JSON.stringify({ id, action: "shutdown" }) + "\n",
      "utf-8"
    );

    // انتظار إغلاق العملية
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (proc && !proc.killed) proc.kill();
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);

      proc.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  } catch {
    if (proc && !proc.killed) proc.kill();
  }

  proc = null;
  rl = null;
  state = "idle";
  pending.clear();
  retryAttempted = false;
};

/**
 * الحصول على حالة البريدج الحالية
 */
export const getState = () => state;
