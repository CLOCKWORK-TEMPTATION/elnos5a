/**
 * @module utils/file-import/document-model
 * @description نموذج المستند الأساسي لتطبيق Filmlane.
 *
 * يُعرّف هيكل كتلة السيناريو ({@link ScreenplayBlock})، حمولة التصدير/الاستيراد
 * ({@link ScreenplayPayloadV1})، وآليات الترميز/فكّ الترميز (Base64 + FNV1a checksum).
 *
 * يتضمن تحويلات ثنائية الاتجاه بين:
 * - كتل السيناريو ↔ HTML (لتكامل Tiptap)
 * - كتل السيناريو ↔ Payload مشفّر (للتصدير/الاستيراد بدون فقدان)
 *
 * علامة الحمولة: `[[FILMLANE_PAYLOAD_V1:<base64>]]`
 */

/**
 * معرّفات التنسيق المتاحة لكتل السيناريو العربي.
 * تُستخدم كاتحاد حرفي عبر `as const` لضمان أمان الأنواع.
 *
 * العناصر العشرة:
 * `basmala` | `scene_header_top_line` | `scene_header_1` | `scene_header_2` |
 * `scene_header_3` | `action` | `character` | `dialogue` | `parenthetical` | `transition`
 */
export const SCREENPLAY_BLOCK_FORMAT_IDS = [
  "basmala",
  "scene_header_top_line",
  "scene_header_1",
  "scene_header_2",
  "scene_header_3",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
] as const;

/** نوع اتحادي حرفي لمعرّفات التنسيق المشتقة من {@link SCREENPLAY_BLOCK_FORMAT_IDS} */
export type ScreenplayFormatId = (typeof SCREENPLAY_BLOCK_FORMAT_IDS)[number];

/**
 * كتلة سيناريو واحدة تربط نصاً بنوع تنسيق.
 * @property formatId - معرّف التنسيق (مثل `'dialogue'` أو `'action'`)
 * @property text - النص الخام للكتلة
 */
export interface ScreenplayBlock {
  formatId: ScreenplayFormatId;
  text: string;
}

/**
 * حمولة التصدير/الاستيراد للإصدار الأول.
 * تحتوي كتل السيناريو مع بيانات وصفية (خط، حجم، تاريخ) وبصمة تحقق FNV1a.
 *
 * @property version - رقم إصدار الحمولة (دائماً `1`)
 * @property blocks - مصفوفة كتل السيناريو المُصنَّفة
 * @property font - اسم الخط المستخدم (مثل `'AzarMehrMonospaced-San'`)
 * @property size - حجم الخط (مثل `'12pt'`)
 * @property checksum - بصمة FNV1a هيكساديسيمال (8 محارف)
 * @property createdAt - طابع زمني ISO 8601
 */
export interface ScreenplayPayloadV1 {
  version: 1;
  blocks: ScreenplayBlock[];
  font: string;
  size: string;
  checksum: string;
  createdAt: string;
}

/** رقم إصدار بروتوكول الحمولة الحالي */
export const SCREENPLAY_PAYLOAD_VERSION = 1 as const;

/** رمز التعريف المُضمَّن في علامة الحمولة: `[[FILMLANE_PAYLOAD_V1:...]]` */
export const SCREENPLAY_PAYLOAD_TOKEN = "FILMLANE_PAYLOAD_V1" as const;

const MARKER_RE = new RegExp(
  String.raw`\[\[${SCREENPLAY_PAYLOAD_TOKEN}:([A-Za-z0-9+/=]+)\]\]`,
  "u"
);

const FORMAT_ID_SET = new Set<string>(SCREENPLAY_BLOCK_FORMAT_IDS);

const DATA_TYPE_TO_FORMAT_ID: Record<string, ScreenplayFormatId> = {
  basmala: "basmala",
  scene_header_top_line: "scene_header_top_line",
  scene_header_1: "scene_header_1",
  scene_header_2: "scene_header_2",
  scene_header_3: "scene_header_3",
  action: "action",
  character: "character",
  dialogue: "dialogue",
  parenthetical: "parenthetical",
  transition: "transition",
  sceneHeaderTopLine: "scene_header_top_line",
  sceneHeader3: "scene_header_3",
};

/** يُطبّع نص كتلة: يحوّل المسافات غير القابلة للكسر إلى عادية ويزيل CR */
const normalizeBlockText = (value: string): string =>
  (value ?? "").replace(/\u00A0/g, " ").replace(/\r/g, "");

/** يهرب محارف HTML الخمسة الخطرة (`& < > " '`) لمنع حقن XSS */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** يحوّل سلسلة UTF-8 إلى Base64 عبر TextEncoder + btoa */
const utf8ToBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

/** يحوّل سلسلة Base64 إلى UTF-8 عبر atob + TextDecoder */
const base64ToUtf8 = (value: string): string => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

/**
 * يحسب بصمة FNV-1a (32-بت) لسلسلة نصية.
 * تُستخدم كبصمة تحقق سريعة وغير تشفيرية للحمولة.
 * @param input - السلسلة المراد حساب بصمتها
 * @returns سلسلة هيكساديسيمال مُبطَّنة بأصفار (8 محارف)
 */
const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/**
 * يُطبّع معرّف تنسيق خام إلى {@link ScreenplayFormatId} صالح.
 * يدعم الصيغ القديمة (camelCase مثل `sceneHeaderTopLine`) والحديثة (kebab-case).
 * @returns المعرّف المُطبَّع أو `null` إذا كان غير معروف
 */
const normalizeFormatId = (value: string): ScreenplayFormatId | null => {
  if (!value) return null;
  if (value in DATA_TYPE_TO_FORMAT_ID) {
    return DATA_TYPE_TO_FORMAT_ID[value];
  }
  if (FORMAT_ID_SET.has(value)) {
    return value as ScreenplayFormatId;
  }
  return null;
};

/**
 * يستخرج معرّف التنسيق من عنصر HTML عبر `data-type` أولاً ثم فئات CSS (`format-*`).
 * @param element - عنصر DOM المراد فحصه
 * @returns المعرّف المُطبَّع أو `null`
 */
const getFormatIdFromElement = (
  element: Element
): ScreenplayFormatId | null => {
  const dataType = element.getAttribute("data-type");
  if (dataType) {
    const normalized = normalizeFormatId(dataType);
    if (normalized) return normalized;
  }

  const classNames = Array.from(element.classList);
  for (const className of classNames) {
    if (!className.startsWith("format-")) continue;
    const rawId = className.slice("format-".length);
    const normalized = normalizeFormatId(rawId);
    if (normalized) return normalized;
  }

  return null;
};

/**
 * يفكّ سطر ترويسة مشهد مُركَّب (top-line) إلى أجزائه: رقم المشهد (header-1) وزمن/مكان (header-2).
 * يعالج الفواصل: شرطة، نقطتين، فاصلة عربية، أو مسافة.
 * @param text - نص السطر المُركَّب
 * @returns مصفوفة كتل مقسّمة (1-2 عنصر) أو مصفوفة فارغة
 */
const splitLegacyTopLineText = (
  text: string
): Array<{ formatId: "scene_header_1" | "scene_header_2"; text: string }> => {
  const normalized = normalizeBlockText(text).replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const pairMatch = normalized.match(
    /^((?:مشهد|scene)\s*[0-9٠-٩]+)\s*(?:[-–—:،]\s*|\s+)(.+)$/iu
  );
  if (pairMatch) {
    return [
      { formatId: "scene_header_1", text: pairMatch[1].trim() },
      { formatId: "scene_header_2", text: pairMatch[2].trim() },
    ];
  }

  if (/^(?:مشهد|scene)\s*[0-9٠-٩]+/iu.test(normalized)) {
    return [{ formatId: "scene_header_1", text: normalized }];
  }

  return [{ formatId: "scene_header_2", text: normalized }];
};

/**
 * يُطبّع مصفوفة كتل واردة: يُطبّع المعرّفات، يفكّ أسطر top-line، ويُطبّع النصوص.
 * يُستخدم كبوابة تطبيع موحّدة قبل الترميز أو التحويل إلى HTML.
 */
const normalizeIncomingBlocks = (
  blocks: ScreenplayBlock[]
): ScreenplayBlock[] => {
  const normalizedBlocks: ScreenplayBlock[] = [];

  for (const block of blocks) {
    const formatId = normalizeFormatId(block.formatId);
    if (!formatId) continue;

    if (formatId === "scene_header_top_line") {
      normalizedBlocks.push(...splitLegacyTopLineText(block.text));
      continue;
    }

    normalizedBlocks.push({
      formatId,
      text: normalizeBlockText(block.text),
    });
  }

  return normalizedBlocks;
};

/**
 * يستخرج أسطر النص من عنصر DOM (يفضّل `innerText` على `textContent`).
 * @returns مصفوفة أسطر مُطبَّعة (عنصر واحد على الأقل)
 */
const toLineTextsFromNode = (element: Element): string[] => {
  const rawText =
    element instanceof HTMLElement && typeof element.innerText === "string"
      ? element.innerText
      : element.textContent || "";

  const lines = normalizeBlockText(rawText)
    .split("\n")
    .map((line) => line.trim());

  return lines.length > 0 ? lines : [""];
};

/** يحسب بصمة FNV1a للحمولة بدون حقل checksum عبر تسلسل JSON */
const computePayloadChecksum = (
  payload: Omit<ScreenplayPayloadV1, "checksum">
): string => {
  return fnv1a(JSON.stringify(payload));
};

/**
 * يُطبّع الحمولة ويعيد حساب بصمة التحقق FNV1a.
 * يُطبّق {@link normalizeIncomingBlocks} على الكتل قبل الحساب.
 *
 * @param payload - حمولة بدون بصمة (أو ببصمة قديمة تُتجاهل)
 * @returns حمولة كاملة من نوع {@link ScreenplayPayloadV1} ببصمة صحيحة
 */
export const ensurePayloadChecksum = (
  payload: Omit<ScreenplayPayloadV1, "checksum"> & { checksum?: string }
): ScreenplayPayloadV1 => {
  const unsignedPayload = {
    version: SCREENPLAY_PAYLOAD_VERSION,
    blocks: normalizeIncomingBlocks(payload.blocks),
    font: payload.font,
    size: payload.size,
    createdAt: payload.createdAt,
  } as const;

  return {
    ...unsignedPayload,
    checksum: computePayloadChecksum(unsignedPayload),
  };
};

/**
 * يبني علامة الحمولة الكاملة: `[[FILMLANE_PAYLOAD_V1:<encodedPayload>]]`
 * @param encodedPayload - الحمولة المشفّرة بـ Base64
 */
export const buildPayloadMarker = (encodedPayload: string): string =>
  `[[${SCREENPLAY_PAYLOAD_TOKEN}:${encodedPayload}]]`;

/**
 * يستخرج الجزء المشفّر بـ Base64 من علامة الحمولة في النص.
 * @param text - النص الذي قد يحتوي علامة `[[FILMLANE_PAYLOAD_V1:...]]`
 * @returns السلسلة المشفّرة أو `null` إذا لم تُوجد علامة
 */
export const extractEncodedPayloadMarker = (text: string): string | null => {
  const match = (text ?? "").match(MARKER_RE);
  return match?.[1] ?? null;
};

/**
 * يُرمّز حمولة السيناريو إلى سلسلة Base64 عبر تسلسل JSON ثم UTF-8→Base64.
 * @param payload - حمولة كاملة من نوع {@link ScreenplayPayloadV1}
 * @returns سلسلة Base64 جاهزة للتضمين في علامة الحمولة
 */
export const encodeScreenplayPayload = (payload: ScreenplayPayloadV1): string =>
  utf8ToBase64(JSON.stringify(payload));

/**
 * يفكّ ترميز حمولة سيناريو من سلسلة Base64 ويتحقق من سلامتها.
 *
 * خطوات التحقق:
 * 1. فك Base64 → JSON → كائن
 * 2. التحقق من وجود جميع الحقول الإلزامية وأنواعها
 * 3. تطبيع معرّفات التنسيق ونصوص الكتل
 * 4. إعادة حساب بصمة FNV1a ومقارنتها بالبصمة المُخزَّنة
 *
 * @param encodedPayload - سلسلة Base64 المستخرجة من علامة الحمولة
 * @returns حمولة صالحة أو `null` إذا فشل أي تحقق
 */
export const decodeScreenplayPayload = (
  encodedPayload: string
): ScreenplayPayloadV1 | null => {
  try {
    const decoded = base64ToUtf8(encodedPayload);
    const parsed = JSON.parse(decoded) as Partial<ScreenplayPayloadV1>;

    if (
      parsed?.version !== SCREENPLAY_PAYLOAD_VERSION ||
      !Array.isArray(parsed.blocks) ||
      typeof parsed.font !== "string" ||
      typeof parsed.size !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.checksum !== "string"
    ) {
      return null;
    }

    const sanitizedBlocks: ScreenplayBlock[] = [];
    for (const block of parsed.blocks) {
      if (!block || typeof block !== "object") continue;
      if (typeof block.text !== "string" || typeof block.formatId !== "string")
        continue;

      const normalized = normalizeFormatId(block.formatId);
      if (!normalized) continue;

      sanitizedBlocks.push({
        formatId: normalized,
        text: normalizeBlockText(block.text),
      });
    }

    const rebuilt = ensurePayloadChecksum({
      version: SCREENPLAY_PAYLOAD_VERSION,
      blocks: sanitizedBlocks,
      font: parsed.font,
      size: parsed.size,
      createdAt: parsed.createdAt,
    });

    if (rebuilt.checksum !== parsed.checksum) {
      return null;
    }

    return rebuilt;
  } catch {
    return null;
  }
};

/**
 * يستخرج ويفكّ ترميز حمولة السيناريو من نص يحتوي علامة حمولة.
 * يجمع بين {@link extractEncodedPayloadMarker} و {@link decodeScreenplayPayload}.
 *
 * @param text - النص الذي قد يحتوي `[[FILMLANE_PAYLOAD_V1:...]]`
 * @returns حمولة صالحة أو `null` إذا لم تُوجد علامة أو فشل فك الترميز
 */
export const extractPayloadFromText = (
  text: string
): ScreenplayPayloadV1 | null => {
  const encoded = extractEncodedPayloadMarker(text);
  if (!encoded) return null;
  return decodeScreenplayPayload(encoded);
};

/**
 * يحوّل سلسلة HTML إلى مصفوفة كتل سيناريو عبر DOMParser.
 *
 * يعالج ثلاث حالات لكل عقدة:
 * - عقدة نصية → كتل `action`
 * - عنصر `scene_header_top_line` → فكّ إلى `scene_header_1` + `scene_header_2`
 * - عنصر آخر → استخراج formatId من `data-type` أو CSS class
 *
 * يُطبّق {@link normalizeIncomingBlocks} على النتيجة النهائية.
 *
 * @param html - سلسلة HTML من محرر Tiptap أو مصدر خارجي
 * @returns مصفوفة كتل مُطبَّعة (فارغة إذا كان HTML فارغاً أو DOMParser غير متاح)
 */
export const htmlToScreenplayBlocks = (html: string): ScreenplayBlock[] => {
  if (!html || !html.trim()) return [];
  if (typeof DOMParser === "undefined") return [];

  const parser = new DOMParser();
  const documentRef = parser.parseFromString(
    `<div id="screenplay-model-root">${html}</div>`,
    "text/html"
  );
  const root = documentRef.getElementById("screenplay-model-root");
  if (!root) return [];

  const blocks: ScreenplayBlock[] = [];

  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textLines = normalizeBlockText(node.textContent || "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      textLines.forEach((line) => {
        blocks.push({ formatId: "action", text: line });
      });
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    const formatId = getFormatIdFromElement(element) ?? "action";

    if (formatId === "scene_header_top_line") {
      const directChildren = Array.from(element.children);
      const sceneHeader1 = directChildren.find((child) => {
        const id = getFormatIdFromElement(child);
        return id === "scene_header_1";
      });
      const sceneHeader2 = directChildren.find((child) => {
        const id = getFormatIdFromElement(child);
        return id === "scene_header_2";
      });

      if (sceneHeader1) {
        toLineTextsFromNode(sceneHeader1).forEach((line) => {
          blocks.push({ formatId: "scene_header_1", text: line });
        });
      }

      if (sceneHeader2) {
        toLineTextsFromNode(sceneHeader2).forEach((line) => {
          blocks.push({ formatId: "scene_header_2", text: line });
        });
      }

      if (!sceneHeader1 && !sceneHeader2) {
        blocks.push(...splitLegacyTopLineText(element.textContent || ""));
      }

      return;
    }

    toLineTextsFromNode(element).forEach((line) => {
      blocks.push({ formatId, text: line });
    });
  });

  return normalizeIncomingBlocks(blocks);
};

/**
 * يبني HTML لعنصر top-line مركّب من header-1 و header-2 مع تهريب XSS.
 * @internal يُستخدم حصرياً من {@link screenplayBlocksToHtml}
 */
const renderTopLineBlock = (header1: string, header2: string): string => {
  const top = normalizeBlockText(header1).trim();
  const bottom = normalizeBlockText(header2).trim();
  return `<div data-type="scene_header_top_line"><div data-type="scene_header_1">${
    top ? escapeHtml(top) : ""
  }</div><div data-type="scene_header_2">${bottom ? escapeHtml(bottom) : ""}</div></div>`;
};

/**
 * يحوّل مصفوفة كتل سيناريو إلى سلسلة HTML جاهزة لمحرر Tiptap.
 *
 * يعالج ثلاث حالات خاصة لترويسات المشاهد:
 * - `scene_header_top_line` → فكّ ثم عرض كـ top-line مركّب
 * - `scene_header_1` يليه `scene_header_2` → دمجهما في top-line واحد
 * - `scene_header_1` أو `scene_header_2` منفرداً → top-line بجزء فارغ
 *
 * باقي الأنواع تُعرض كـ `<div data-type="formatId">text</div>`.
 *
 * @param blocks - مصفوفة كتل من نوع {@link ScreenplayBlock}
 * @returns سلسلة HTML مُطبَّعة
 */
export const screenplayBlocksToHtml = (blocks: ScreenplayBlock[]): string => {
  const normalized = normalizeIncomingBlocks(
    (blocks ?? []).filter(
      (block): block is ScreenplayBlock =>
        Boolean(block) &&
        typeof block.text === "string" &&
        typeof block.formatId === "string"
    )
  );

  const html: string[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i];
    const next = normalized[i + 1];

    if (current.formatId === "scene_header_top_line") {
      const parts = splitLegacyTopLineText(current.text);
      const header1 =
        parts.find((part) => part.formatId === "scene_header_1")?.text ?? "";
      const header2 =
        parts.find((part) => part.formatId === "scene_header_2")?.text ?? "";
      html.push(renderTopLineBlock(header1, header2));
      continue;
    }

    if (current.formatId === "scene_header_1") {
      if (next && next.formatId === "scene_header_2") {
        html.push(renderTopLineBlock(current.text, next.text));
        i += 1;
        continue;
      }
      html.push(renderTopLineBlock(current.text, ""));
      continue;
    }

    if (current.formatId === "scene_header_2") {
      html.push(renderTopLineBlock("", current.text));
      continue;
    }

    const text = normalizeBlockText(current.text);
    const htmlText = text ? escapeHtml(text).replace(/\n/g, "<br>") : "";
    html.push(`<div data-type="${current.formatId}">${htmlText}</div>`);
  }

  return html.join("");
};

/**
 * يبني حمولة سيناريو كاملة من مصفوفة كتل مع بصمة FNV1a.
 *
 * القيم الافتراضية: خط `AzarMehrMonospaced-San`، حجم `12pt`، تاريخ ISO حالي.
 *
 * @param blocks - مصفوفة كتل المصدر
 * @param options - خيارات اختيارية (font, size, createdAt)
 * @returns حمولة كاملة من نوع {@link ScreenplayPayloadV1}
 */
export const createPayloadFromBlocks = (
  blocks: ScreenplayBlock[],
  options?: {
    font?: string;
    size?: string;
    createdAt?: string;
  }
): ScreenplayPayloadV1 => {
  return ensurePayloadChecksum({
    version: SCREENPLAY_PAYLOAD_VERSION,
    blocks: normalizeIncomingBlocks(blocks),
    font: options?.font ?? "AzarMehrMonospaced-San",
    size: options?.size ?? "12pt",
    createdAt: options?.createdAt ?? new Date().toISOString(),
  });
};

/**
 * يبني حمولة سيناريو كاملة من سلسلة HTML.
 * اختصار يجمع {@link htmlToScreenplayBlocks} ثم {@link createPayloadFromBlocks}.
 *
 * @param html - سلسلة HTML من محرر Tiptap
 * @param options - خيارات اختيارية (font, size, createdAt)
 * @returns حمولة كاملة من نوع {@link ScreenplayPayloadV1}
 */
export const createPayloadFromHtml = (
  html: string,
  options?: {
    font?: string;
    size?: string;
    createdAt?: string;
  }
): ScreenplayPayloadV1 => {
  const blocks = htmlToScreenplayBlocks(html);
  return createPayloadFromBlocks(blocks, options);
};
