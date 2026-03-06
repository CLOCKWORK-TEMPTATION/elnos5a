/**
 * @module types/screenplay
 * @description أنماط السيناريو الأساسية — تُستخدم في كامل التطبيق كأساس لتمثيل عناصر السيناريو
 *
 * يُصدّر هذا الملف نوعين جوهريين:
 * - `DocumentStats` — إحصائيات المستند المعروضة في تذييل المحرر
 * - `LineType` — الاتحاد المُميّز لأنواع عناصر السيناريو العشرة
 */

/**
 * إحصائيات المستند — تُحسب في الوقت الفعلي وتُعرض في تذييل المحرر
 *
 * @property words - عدد الكلمات الإجمالي في المستند
 * @property characters - عدد الحروف الإجمالي (بدون مسافات)
 * @property pages - عدد صفحات A4 المُحتسبة بناءً على ارتفاع المحتوى
 * @property scenes - عدد المشاهد (عدد عناصر scene_header_1)
 */
export interface DocumentStats {
  words: number;
  characters: number;
  pages: number;
  scenes: number;
}

/**
 * نوع عنصر السيناريو — الاتحاد المُميّز الذي يُعرّف العناصر العشرة المدعومة
 *
 * العناصر حسب الفئة:
 * - **دينية**: `basmala` — البسملة في بداية المستند
 * - **رؤوس المشاهد**: `scene_header_top_line` (سطر فوقي)،
 *   `scene_header_1` (رئيسي)، `scene_header_2` (فرعي)، `scene_header_3` (وصف زمني/مكاني)
 * - **سردية**: `action` — وصف الحدث والمشهد
 * - **حوارية**: `character` (اسم الشخصية)، `dialogue` (الحوار)،
 *   `parenthetical` (توجيه أدائي بين قوسين)
 * - **انتقالية**: `transition` — انتقال بين المشاهد (قطع، مزج، إلخ)
 *
 * @see extensions/ — كل نوع له عقدة Tiptap مخصصة في مجلد الامتدادات
 */
export type LineType =
  | "basmala"
  | "scene_header_top_line"
  | "scene_header_1"
  | "scene_header_2"
  | "scene_header_3"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition";

/**
 * نوع الملف السينمائي — صيغ الاستيراد/التصدير الشائعة في المحرر.
 * أُضيف `docx` ضمن النقل التوافقي مع Filmlane.
 */
export type FileType = "fountain" | "fdx" | "pdf" | "docx" | "txt" | "html";
