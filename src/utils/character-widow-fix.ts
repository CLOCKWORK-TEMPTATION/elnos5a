import type { Editor } from "@tiptap/core";

/**
 * @description خوارزميات إصلاح مشكلة "الشخصية اليتيمة" (Character Widow Fix)
 *
 * المشكلة: عندما ينتهي اسم الشخصية في أسفل الصفحة ولا يتبعه حوار في نفس الصفحة
 * الحل: دفع الشخصية إلى الصفحة التالية لضمان ظهور الحوار معها
 */

export class CharacterWidowFixer {
  private rafId: number | null = null;
  private applyingFix = false;

  /**
   * @description جدولة إصلاح الشخصية اليتيمة في الإطار التالي
   */
  schedule(editor: Editor): void {
    if (typeof window === "undefined") return;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
    }

    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null;
      this.apply(editor);
    });
  }

  /**
   * @description إلغاء جدولة الإصلاح
   */
  cancel(): void {
    if (typeof window === "undefined" || this.rafId === null) return;
    window.cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /**
   * @description تطبيق إصلاح الشخصية اليتيمة
   */
  private apply(editor: Editor): void {
    if (this.applyingFix) return;

    const editorRoot = document.querySelector<HTMLElement>(
      ".filmlane-prosemirror-root, .ProseMirror"
    );
    if (!editorRoot) return;

    // ── 1. مسح جميع الإصلاحات السابقة لإعادة التخطيط لحالته الطبيعية ──
    const previouslyFixed = editorRoot.querySelectorAll<HTMLElement>(
      "[data-character-widow-fix]"
    );
    for (const el of previouslyFixed) {
      const prop = el.getAttribute("data-character-widow-fix") || "margin-top";
      el.style.removeProperty(prop);
      el.removeAttribute("data-character-widow-fix");
    }

    // فرض إعادة تدفق متزامنة لضمان دقة الإحداثيات بعد المسح
    void editorRoot.offsetHeight;

    // ── 2. تجميع جميع عناصر كتل المحتوى ──
    const allBlocks = Array.from(
      editorRoot.querySelectorAll<HTMLElement>("[data-type]")
    );
    if (allBlocks.length === 0) return;

    // ── 3. كشف عناصر الشخصية "اليتيمة" (المعزولة في أسفل الصفحة) ──
    const pagesStorage = editor.storage as {
      pages?: { getPageForPosition?: (pos: number) => number };
    };
    const getPageFn = pagesStorage.pages?.getPageForPosition;

    let hasAdjustment = false;

    for (let i = 0; i < allBlocks.length; i += 1) {
      const current = allBlocks[i];
      if (current.getAttribute("data-type") !== "character") continue;

      // إيجاد حاوي الصفحة لعنصر الشخصية هذا
      const page = current.closest(".tiptap-page");
      if (!page) continue;

      const charRect = current.getBoundingClientRect();
      const footer = page.querySelector(".tiptap-page-footer");
      const contentBottom = footer
        ? footer.getBoundingClientRect().top
        : page.getBoundingClientRect().bottom;
      const spaceBelow = contentBottom - charRect.bottom;

      // الكتلة السابقة والتالية بترتيب المستند
      const prev = i > 0 ? allBlocks[i - 1] : null;
      const next = i + 1 < allBlocks.length ? allBlocks[i + 1] : null;

      let isWidow = false;

      // ── أولاً: الفحص الهندسي ──
      // إذا كانت المساحة المتبقية في الصفحة بعد الشخصية أقل من
      // 1.5 ضعف ارتفاع السطر، فلا مكان للحوار → الشخصية يتيمة.
      // نستخدم 1.5 × الارتفاع لضمان مساحة كافية لسطر حوار واحد على الأقل.
      if (spaceBelow >= 0 && spaceBelow < charRect.height * 1.5) {
        isWidow = true;
      }

      // ── ثانياً: واجهة برمجة امتداد الصفحات ──
      if (!isWidow && next && typeof getPageFn === "function") {
        try {
          const p1 = getPageFn(editor.view.posAtDOM(current, 0));
          const p2 = getPageFn(editor.view.posAtDOM(next, 0));
          if (p1 !== p2) isWidow = true;
        } catch {
          /* fall through to DOM method */
        }
      }

      // ── TERTIARY: DOM page containers ──
      if (!isWidow && next) {
        const nextPage = next.closest(".tiptap-page");
        if (page && nextPage && page !== nextPage) isWidow = true;
      }

      if (!isWidow) continue;

      // ── 4. دفع الشخصية لتجاوز منطقة محتوى الصفحة الحالية ──
      // لمنع فجوة بصرية كبيرة أعلى الصفحة التالية، نفضّل إضافة
      // `margin-bottom` للعنصر السابق في نفس الصفحة. إذا تعذّر ذلك،
      // نرجع لإضافة `margin-top` على عنصر الشخصية نفسه.
      const prevPage = prev ? prev.closest(".tiptap-page") : null;
      const effectiveSpaceBelow = Math.max(0, spaceBelow);

      let pushTarget = current;
      let targetProp = "margin-top";
      let pushAmount = Math.ceil(effectiveSpaceBelow + charRect.height) + 4;

      if (prev && prevPage === page) {
        pushTarget = prev;
        targetProp = "margin-bottom";
        // يكفي دفع الحافة السفلية للعنصر الحالي لتجاوز حد الصفحة
        pushAmount = Math.ceil(effectiveSpaceBelow) + 4;
      }

      pushTarget.style.setProperty(targetProp, `${pushAmount}px`, "important");
      pushTarget.setAttribute("data-character-widow-fix", targetProp);
      hasAdjustment = true;
    }

    if (!hasAdjustment) return;

    // ── 5. حارس: إطارا رسوم متحركة مزدوجان لإتمام إعادة تدفق امتداد الصفحات قبل إعادة الفحص ──
    this.applyingFix = true;
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          this.applyingFix = false;
        });
      });
    } else {
      this.applyingFix = false;
    }
  }

  /**
   * @description التحقق من حالة التطبيق الحالية
   */
  get isApplyingFix(): boolean {
    return this.applyingFix;
  }
}
