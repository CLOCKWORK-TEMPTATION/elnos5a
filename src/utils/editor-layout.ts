import {
  FOOTER_HEIGHT_PX,
  PAGE_HEIGHT_PX,
  PAGE_MARGIN_BOTTOM_PX,
  PAGE_MARGIN_LEFT_PX,
  PAGE_MARGIN_RIGHT_PX,
  PAGE_MARGIN_TOP_PX,
  PAGE_WIDTH_PX,
} from "../constants";
import {
  applyEditorFormatStyleVariables,
  LOCKED_EDITOR_FONT_FAMILY,
  LOCKED_EDITOR_FONT_SIZE,
  LOCKED_EDITOR_LINE_HEIGHT,
} from "../constants";

/**
 * @description أدوات مساعدة لتطبيق تخطيط وطباعة محرر السيناريو
 */

/**
 * @description تطبيق مقاييس التخطيط الثابتة على ورقة السيناريو
 */
export const applyLayoutMetrics = (sheet: HTMLDivElement): void => {
  sheet.style.setProperty("--page-width", `${PAGE_WIDTH_PX}px`);
  sheet.style.setProperty("--page-height", `${PAGE_HEIGHT_PX}px`);
  sheet.style.setProperty("--page-header-height", "77px");
  sheet.style.setProperty("--page-footer-height", `${FOOTER_HEIGHT_PX}px`);
  sheet.style.setProperty("--page-margin-top", `${PAGE_MARGIN_TOP_PX}px`);
  sheet.style.setProperty("--page-margin-bottom", `${PAGE_MARGIN_BOTTOM_PX}px`);
  sheet.style.setProperty("--page-margin-left", `${PAGE_MARGIN_LEFT_PX}px`);
  sheet.style.setProperty("--page-margin-right", `${PAGE_MARGIN_RIGHT_PX}px`);
  applyEditorFormatStyleVariables(sheet.style);
};

/**
 * @description تطبيق خصائص الطباعة الثابتة على عنصر المحرر
 */
export const applyEditorTypography = (target: HTMLElement): void => {
  target.style.setProperty(
    "font-family",
    LOCKED_EDITOR_FONT_FAMILY,
    "important"
  );
  target.style.setProperty("font-size", LOCKED_EDITOR_FONT_SIZE, "important");
  target.style.setProperty(
    "line-height",
    LOCKED_EDITOR_LINE_HEIGHT,
    "important"
  );
  target.style.setProperty("direction", "rtl");
  target.style.setProperty("font-weight", "700");
};
