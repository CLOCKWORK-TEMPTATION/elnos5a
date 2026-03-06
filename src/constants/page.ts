/**
 * @module constants/page
 * @description أبعاد صفحة A4 بدقة 96 PPI وهوامش السيناريو العربي.
 *
 * الأبعاد: 794×1123 بكسل (A4 عند 96 PPI).
 * الهوامش: 77px أعلى/أسفل، 96px يسار، 120px يمين.
 * يُستخدم من امتداد Pages في Tiptap ومن EditorArea لإدارة التقسيم الصفحي.
 */

/** دقة الشاشة: 96 نقطة لكل بوصة */
export const PPI = 96;
const MM_PER_INCH = 25.4;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
/** ارتفاع الصفحة الكامل بالبكسل (A4 عند 96 PPI) */
export const PAGE_HEIGHT_PX = Math.round((A4_HEIGHT_MM / MM_PER_INCH) * PPI);
/** عرض الصفحة الكامل بالبكسل (A4 عند 96 PPI) */
export const PAGE_WIDTH_PX = Math.round((A4_WIDTH_MM / MM_PER_INCH) * PPI);
/** ارتفاع منطقة الترويسة (header spacer) بالبكسل */
export const HEADER_HEIGHT_PX = 77;
/** ارتفاع منطقة التذييل (footer) بالبكسل */
export const FOOTER_HEIGHT_PX = 96;
/** المسافة بين الصفحات المتتالية بالبكسل */
export const PAGE_GAP_PX = 24;
/** هامش أعلى الصفحة بالبكسل */
export const PAGE_MARGIN_TOP_PX = 77;
/** هامش أسفل الصفحة بالبكسل */
export const PAGE_MARGIN_BOTTOM_PX = 77;
/** هامش يسار الصفحة بالبكسل (الجهة الضيقة في RTL) */
export const PAGE_MARGIN_LEFT_PX = 96;
/** هامش يمين الصفحة بالبكسل (الجهة العريضة في RTL) */
export const PAGE_MARGIN_RIGHT_PX = 120;
/** ارتفاع المحتوى الصافي = ارتفاع الصفحة − الهوامش العلوية والسفلية */
export const CONTENT_HEIGHT_PX =
  PAGE_HEIGHT_PX - PAGE_MARGIN_TOP_PX - PAGE_MARGIN_BOTTOM_PX;
