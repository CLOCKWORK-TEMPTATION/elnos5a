const toExecBuffer = (value) =>
  Buffer.isBuffer(value) ? value : Buffer.from(value ?? "", "utf-8");

const toSafeExecPreview = (buffer, maxLength = 400) =>
  toExecBuffer(buffer)
    .toString("utf-8")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

export class ExecFileClassifiedError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ExecFileClassifiedError";
    this.statusCode = options.statusCode ?? 500;
    this.category = options.category ?? "unknown-exec-failure";
    this.classifiedError = options.classifiedError ?? {
      category: this.category,
    };
  }
}

export const classifyExecFileError = (error, context, timeoutMs) => {
  const code = error?.code;
  const signal = typeof error?.signal === "string" ? error.signal : "";
  const message = typeof error?.message === "string" ? error.message : "";
  const timedOut =
    code === "ETIMEDOUT" ||
    signal === "SIGTERM" ||
    /timed out/i.test(message) ||
    Boolean(error?.killed && signal);

  if (code === "ENOENT") {
    return {
      category: "binary-missing",
      statusCode: 422,
      message: `${context}: البرنامج التنفيذي غير موجود على المسار المطلوب.`,
    };
  }

  if (code === "EACCES") {
    return {
      category: "permission-denied",
      statusCode: 422,
      message: `${context}: لا توجد صلاحية تنفيذ للبرنامج.`,
    };
  }

  if (timedOut) {
    return {
      category: "process-timeout",
      statusCode: 504,
      message: `${context}: انتهت مهلة التنفيذ (${timeoutMs}ms).`,
    };
  }

  if (typeof code === "number" && Number.isFinite(code)) {
    return {
      category: "non-zero-exit",
      statusCode: 422,
      message: `${context}: فشل التنفيذ برمز خروج ${code}.`,
    };
  }

  return {
    category: "unknown-exec-failure",
    statusCode: 500,
    message: `${context}: فشل التنفيذ لسبب غير معروف.`,
  };
};

export const classifyExecError = (
  error,
  context,
  timeoutMs,
  stdout,
  stderr
) => {
  const normalizedStdout = toExecBuffer(stdout);
  const normalizedStderr = toExecBuffer(stderr);
  const classification = classifyExecFileError(error, context, timeoutMs);

  return new ExecFileClassifiedError(classification.message, {
    statusCode: classification.statusCode,
    category: classification.category,
    classifiedError: {
      category: classification.category,
      code:
        typeof error?.code === "string" || typeof error?.code === "number"
          ? error.code
          : undefined,
      signal:
        typeof error?.signal === "string" && error.signal
          ? error.signal
          : undefined,
      stdoutPreview: toSafeExecPreview(normalizedStdout),
      stderrPreview: toSafeExecPreview(normalizedStderr),
    },
  });
};
