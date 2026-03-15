"use client";

/**
 * @file App.tsx
 * @description المكون الجذري لتطبيق أفان تيتر — محرر السيناريو العربي.
 *   يجمع كل واجهات المستخدم (الترويسة، القائمة الرئيسية، الشريط الجانبي، شريط Dock،
 *   منطقة المحرر، الذيل) ويدير:
 *   - دورة حياة EditorArea (إنشاء/تدمير).
 *   - اختصارات لوحة المفاتيح العامة (Ctrl+0..7 للعناصر، Ctrl+S/O/N/Z/Y/B/I/U).
 *   - عمليات الملفات (فتح، إدراج، حفظ، تصدير HTML، طباعة).
 *   - توزيع أوامر القوائم عبر `handleMenuAction`.
 *   - عرض إحصائيات المستند (صفحات، كلمات، حروف، مشاهد) في الذيل.
 *
 * @architecture
 *   نمط هجين: React يدير الغلاف (shell) وحالة واجهة المستخدم،
 *   بينما `EditorArea` (فئة حتمية) تدير محرك Tiptap مباشرة.
 *   المكونات العرضية الصغيرة (`BackgroundGrid`, `DockIconButton`) معرّفة
 *   داخل هذا الملف وليس في ملفات منفصلة.
 *
 * @exports
 *   - `App` — المكون الجذري (named export).
 *
 * @dependencies
 *   - `components/editor` — واجهة محرك المحرر (Barrel + EditorArea).
 *   - `components/ui/hover-border-gradient` — مكون تأثير الحدود المتدرجة.
 *   - `utils/file-import/*` — خط أنابيب استيراد الملفات.
 *   - `extensions/classification-types` — أنواع عناصر السيناريو.
 *   - `lucide-react` — أيقونات الواجهة.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppDock,
  AppFooter,
  AppHeader,
  AppSidebar,
  PipelineMonitor,
  SettingsPanel,
} from "./components/app-shell";
import { EditorArea, type DocumentStats } from "./components/editor";
import { BackgroundGrid } from "./components/ui/BackgroundGrid";
import {
  brandColors,
  classificationTypeOptions,
  colors,
  DOCK_BUTTONS,
  fonts,
  formatClassMap,
  FORMAT_LABEL_BY_TYPE,
  getSpacingMarginTop,
  gradients,
  highlightColors,
  MENU_SECTIONS,
  screenplayFormats,
  semanticColors,
  SHORTCUT_FORMAT_BY_DIGIT,
  SIDEBAR_SECTIONS,
  textSizes,
} from "./constants";
import type { MenuActionId } from "./constants/menu-definitions";
import {
  handleMenuAction,
  handleSidebarItemAction,
  runExport,
  type EditorActionsDeps,
} from "./controllers";
import type { ElementType } from "./extensions/classification-types";
import {
  loadFromStorage,
  saveToStorage,
  subscribeIsMobile,
  toast,
  useAutoSave as scheduleAutoSave,
  useIsMobile as getIsMobile,
  useMenuCommandResolver,
} from "./hooks";
import {
  DEFAULT_TYPING_SYSTEM_SETTINGS,
  minutesToMilliseconds,
  sanitizeTypingSystemSettings,
  type RunDocumentThroughPasteWorkflowOptions,
  type TypingSystemSettings,
} from "./types";
import { logger } from "./utils/logger";

const TYPING_SETTINGS_STORAGE_KEY = "filmlane.typing-system.settings";
const AUTOSAVE_DRAFT_STORAGE_KEY = "filmlane.autosave.document-text.v1";

const LOCKED_EDITOR_FONT_LABEL = fonts[0]?.label ?? "غير محدد";
const LOCKED_EDITOR_FONT_VALUE = fonts[0]?.value ?? "AzarMehrMonospaced-San";
const LOCKED_EDITOR_SIZE_LABEL = textSizes[0]?.label ?? "12";
const SUPPORTED_LEGACY_FORMAT_COUNT = Object.keys(formatClassMap).length;
const CLASSIFIER_OPTION_COUNT = classificationTypeOptions.length;
const ACTION_BLOCK_SPACING = getSpacingMarginTop("action", "action") || "0";

interface EditorAutosaveSnapshot {
  text: string;
  updatedAt: string;
}

const readTypingSystemSettings = (): TypingSystemSettings => {
  const parsed = loadFromStorage<Partial<TypingSystemSettings> | null>(
    TYPING_SETTINGS_STORAGE_KEY,
    null
  );
  return sanitizeTypingSystemSettings(parsed ?? DEFAULT_TYPING_SYSTEM_SETTINGS);
};

/**
 * @description المكون الجذري للتطبيق (App Component). يجمع كل الواجهات (الترويسة، الشريط الجانبي، منطقة المحرر، الذيل) ويدير حالة النسخة والإحصائيات والأحداث العامة.
 *
 * @complexity الزمنية: O(1) للتصيير (Render) | المكانية: O(1) لحفظ المراجع والحالة محلياً.
 *
 * @sideEffects
 *   - ينشئ دورة حياة مفردة لـ `EditorArea`.
 *   - يسجل مستمعي أحداث `keydown` و `click` على الـ `document`.
 *
 * @usedBy
 *   - `main.tsx` لتركيب شجرة React.
 */
export function App(): React.JSX.Element {
  const editorMountRef = useRef<HTMLDivElement | null>(null);
  const editorAreaRef = useRef<EditorArea | null>(null);
  const handleMenuActionRef = useRef<
    ((actionId: MenuActionId) => Promise<void>) | null
  >(null);
  const liveTypingWorkflowTimeoutRef = useRef<number | null>(null);
  const applyingTypingWorkflowRef = useRef(false);
  const lastLiveWorkflowTextRef = useRef("");
  // const hasRestoredAutosaveRef = useRef(false);

  const [stats, setStats] = useState<DocumentStats>({
    pages: 1,
    words: 0,
    characters: 0,
    scenes: 0,
  });
  const [currentFormat, setCurrentFormat] = useState<ElementType | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [openSidebarItem, setOpenSidebarItem] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [isMobile, setIsMobile] = useState<boolean>(() => getIsMobile());
  const [typingSystemSettings, setTypingSystemSettings] =
    useState<TypingSystemSettings>(() => readTypingSystemSettings());
  const [showPipelineMonitor, setShowPipelineMonitor] = useState(false);

  /* ── تركيب/تدمير EditorArea مرة واحدة فقط ── */
  useEffect(() => {
    const mount = editorMountRef.current;
    if (!mount) return;

    const editorArea = new EditorArea({
      mount,
      onContentChange: (text) => setDocumentText(text),
      onStatsChange: (nextStats) => setStats(nextStats),
      onFormatChange: (format) => setCurrentFormat(format),
      onImportError: (message) =>
        toast({
          title: "فشل تطبيق نظام الشك",
          description: message,
          variant: "destructive",
        }),
    });
    editorAreaRef.current = editorArea;

    return () => {
      editorArea.destroy();
      editorAreaRef.current = null;
    };
  }, []);

  useEffect(() => {
    return subscribeIsMobile((nextIsMobile) => {
      setIsMobile(nextIsMobile);
      if (nextIsMobile) {
        setOpenSidebarItem(null);
      }
    });
  }, []);

  // TODO: أعد تفعيل استرجاع المسودة بعد التجربة
  // useEffect(() => {
  //   const area = editorAreaRef.current;
  //   if (!area) return;
  //   if (hasRestoredAutosaveRef.current) return;
  //
  //   const snapshot = loadFromStorage<EditorAutosaveSnapshot | null>(
  //     AUTOSAVE_DRAFT_STORAGE_KEY,
  //     null
  //   );
  //   hasRestoredAutosaveRef.current = true;
  //
  //   if (!snapshot?.text?.trim()) return;
  //
  //   const rafId = window.requestAnimationFrame(() => {
  //     void area
  //       .importClassifiedText(snapshot.text, "replace")
  //       .then(() => {
  //         toast({
  //           title: "تمت استعادة المسودة",
  //           description: "استرجعنا آخر نسخة محفوظة تلقائيًا.",
  //         });
  //       })
  //       .catch((error) => {
  //         logger.warn(
  //           "Autosave restore skipped due early editor lifecycle error",
  //           {
  //             scope: "autosave",
  //             data: error,
  //           }
  //         );
  //       });
  //   });
  //
  //   return () => {
  //     window.cancelAnimationFrame(rafId);
  //   };
  // }, []);

  /* ── إغلاق القوائم عند النقر خارجها ── */
  useEffect(() => {
    const closeMenus = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-app-menu-root="true"]')) {
        return;
      }
      setActiveMenu(null);
    };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  useEffect(() => {
    saveToStorage(TYPING_SETTINGS_STORAGE_KEY, typingSystemSettings);
  }, [typingSystemSettings]);

  useEffect(() => {
    const normalizedText = documentText.trim();
    if (!normalizedText) return;

    scheduleAutoSave<EditorAutosaveSnapshot>(
      AUTOSAVE_DRAFT_STORAGE_KEY,
      {
        text: normalizedText,
        updatedAt: new Date().toISOString(),
      },
      1500
    );
  }, [documentText]);

  /* ── تفعيل Design Tokens من constants/colors.ts ── */
  useEffect(() => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--brand", brandColors.jungleGreen);
    rootStyle.setProperty("--brand-teal", brandColors.teal);
    rootStyle.setProperty("--brand-bronze", brandColors.bronze);
    rootStyle.setProperty("--ring", brandColors.jungleGreen);
    rootStyle.setProperty("--accent", semanticColors.secondary);
    rootStyle.setProperty("--accent-success", semanticColors.success);
    rootStyle.setProperty("--accent-warning", semanticColors.warning);
    rootStyle.setProperty("--accent-error", semanticColors.error);
    rootStyle.setProperty("--accent-creative", semanticColors.creative);
    rootStyle.setProperty("--accent-technical", semanticColors.technical);
    rootStyle.setProperty("--filmlane-brand-gradient", gradients.jungleFull);
    rootStyle.setProperty("--filmlane-brand-gradient-soft", gradients.jungle);
    rootStyle.setProperty("--filmlane-highlight-primary", highlightColors[0]);
    rootStyle.setProperty("--filmlane-highlight-secondary", highlightColors[1]);
    rootStyle.setProperty("--filmlane-palette-dark", colors[0]);
    rootStyle.setProperty("--filmlane-editor-font", LOCKED_EDITOR_FONT_VALUE);
    rootStyle.setProperty(
      "--filmlane-editor-size",
      `${LOCKED_EDITOR_SIZE_LABEL}pt`
    );
  }, []);

  const fileImportBackendEndpoint =
    (
      process.env.NEXT_PUBLIC_FILE_IMPORT_BACKEND_URL as string | undefined
    )?.trim() ||
    (process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:8787/api/file-extract"
      : "");
  const hasFileImportBackend = fileImportBackendEndpoint.length > 0;

  const handleTypingModeChange = (
    nextMode: TypingSystemSettings["typingSystemMode"]
  ): void => {
    setTypingSystemSettings((current) =>
      sanitizeTypingSystemSettings({
        ...current,
        typingSystemMode: nextMode,
      })
    );

    if (
      nextMode !== "auto-live" &&
      liveTypingWorkflowTimeoutRef.current !== null
    ) {
      window.clearTimeout(liveTypingWorkflowTimeoutRef.current);
      liveTypingWorkflowTimeoutRef.current = null;
    }

    logger.info("Typing system mode updated", {
      scope: "typing-system",
      data: { mode: nextMode },
    });
  };

  const handleLiveIdleMinutesChange = (nextMinutes: number): void => {
    setTypingSystemSettings((current) =>
      sanitizeTypingSystemSettings({
        ...current,
        liveIdleMinutes: nextMinutes,
      })
    );
  };

  const runDocumentThroughPasteWorkflow = useCallback(
    async (options: RunDocumentThroughPasteWorkflowOptions): Promise<void> => {
      const area = editorAreaRef.current;
      if (!area) return;

      const fullText = area.getAllText().trim();
      if (!fullText) return;

      if (
        options.source === "live-idle" &&
        fullText === lastLiveWorkflowTextRef.current
      ) {
        return;
      }

      if (applyingTypingWorkflowRef.current) return;
      applyingTypingWorkflowRef.current = true;

      try {
        await area.importClassifiedText(fullText, "replace");
        lastLiveWorkflowTextRef.current = area.getAllText().trim();

        logger.info("Typing workflow executed", {
          scope: "typing-system",
          data: {
            source: options.source,
            reviewProfile: options.reviewProfile,
            policyProfile: options.policyProfile,
          },
        });

        if (!options.suppressToasts) {
          toast({
            title:
              options.source === "live-idle"
                ? "تمت المعالجة الحية"
                : "تمت المعالجة المؤجلة",
            description: "تم تمرير كامل المستند عبر مصنف اللصق وتحديث البنية.",
          });
        }
      } catch (error) {
        logger.error("Typing workflow failed", {
          scope: "typing-system",
          data: error,
        });
        if (!options.suppressToasts) {
          toast({
            title: "تعذر تشغيل نظام الكتابة",
            description:
              error instanceof Error
                ? error.message
                : "حدث خطأ غير معروف أثناء المعالجة.",
            variant: "destructive",
          });
        }
      } finally {
        applyingTypingWorkflowRef.current = false;
      }
    },
    []
  );

  const runForcedProductionSelfCheck = useCallback(
    async (
      trigger: "manual-auto-check" | "manual-reclassify"
    ): Promise<void> => {
      const area = editorAreaRef.current;
      if (!area) return;

      try {
        const { runProductionSelfCheck } =
          await import("./extensions/production-self-check");
        const report = await runProductionSelfCheck({
          trigger,
          sampleText: area.getAllText(),
          force: true,
        });

        if (report.failedFunctions === 0) {
          toast({
            title: "فحص التكامل مكتمل",
            description: `تم تشغيل ${report.executedFunctions} دالة بنجاح عبر مسار الإنتاج.`,
          });
          return;
        }

        toast({
          title: "فحص التكامل اكتشف أخطاء",
          description: `نجح ${report.executedFunctions - report.failedFunctions} وفشل ${report.failedFunctions}.`,
          variant: "destructive",
        });
      } catch (error) {
        logger.error("Forced production self-check failed", {
          scope: "self-check",
          data: error,
        });
        toast({
          title: "تعذر تشغيل فحص التكامل",
          description:
            error instanceof Error
              ? error.message
              : "حدث خطأ غير معروف أثناء فحص التكامل.",
          variant: "destructive",
        });
      }
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const liveIdleDelayMs = minutesToMilliseconds(
      typingSystemSettings.liveIdleMinutes
    );
    if (typingSystemSettings.typingSystemMode !== "auto-live") {
      if (liveTypingWorkflowTimeoutRef.current !== null) {
        window.clearTimeout(liveTypingWorkflowTimeoutRef.current);
        liveTypingWorkflowTimeoutRef.current = null;
      }
      return;
    }

    const normalizedText = documentText.trim();
    if (!normalizedText) return;
    if (applyingTypingWorkflowRef.current) return;
    if (normalizedText === lastLiveWorkflowTextRef.current) return;

    if (liveTypingWorkflowTimeoutRef.current !== null) {
      window.clearTimeout(liveTypingWorkflowTimeoutRef.current);
    }

    liveTypingWorkflowTimeoutRef.current = window.setTimeout(() => {
      liveTypingWorkflowTimeoutRef.current = null;
      void runDocumentThroughPasteWorkflow({
        source: "live-idle",
        reviewProfile: "silent-live",
        policyProfile: "strict-structure",
        suppressToasts: true,
      });
    }, liveIdleDelayMs);

    return () => {
      if (liveTypingWorkflowTimeoutRef.current !== null) {
        window.clearTimeout(liveTypingWorkflowTimeoutRef.current);
        liveTypingWorkflowTimeoutRef.current = null;
      }
    };
  }, [documentText, runDocumentThroughPasteWorkflow, typingSystemSettings]);

  /* ── اختصارات لوحة المفاتيح العامة ── */
  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;

      const key = event.key.toLowerCase();

      // مراقب الـ pipeline — يعمل حتى لو المحرر مش جاهز
      if (event.shiftKey && key === "m") {
        event.preventDefault();
        setShowPipelineMonitor((prev) => !prev);
        return;
      }

      const area = editorAreaRef.current;
      if (!area) return;

      if (key in SHORTCUT_FORMAT_BY_DIGIT) {
        event.preventDefault();
        area.setFormat(SHORTCUT_FORMAT_BY_DIGIT[key]);
        return;
      }

      switch (key) {
        case "s":
          event.preventDefault();
          void handleMenuActionRef.current?.("save-file");
          break;
        case "o":
          event.preventDefault();
          void handleMenuActionRef.current?.("open-file");
          break;
        case "n":
          event.preventDefault();
          void handleMenuActionRef.current?.("new-file");
          break;
        case "z":
          event.preventDefault();
          area.runCommand("undo");
          break;
        case "y":
          event.preventDefault();
          area.runCommand("redo");
          break;
        case "b":
          event.preventDefault();
          area.runCommand("bold");
          break;
        case "i":
          event.preventDefault();
          area.runCommand("italic");
          break;
        case "u":
          event.preventDefault();
          area.runCommand("underline");
          break;
        default:
          break;
      }
    };

    document.addEventListener("keydown", handleGlobalShortcut);
    return () => document.removeEventListener("keydown", handleGlobalShortcut);
  }, []);

  const resolveMenuCommand = useMenuCommandResolver(editorAreaRef, toast);

  const actionDeps: EditorActionsDeps = {
    getArea: () => editorAreaRef.current,
    toast,
    resolveMenuCommand,
    runDocumentThroughPasteWorkflow,
    runForcedProductionSelfCheck,
    typingSystemSettings,
  };

  const dispatchMenuAction = async (actionId: MenuActionId): Promise<void> => {
    setActiveMenu(null);
    await handleMenuAction(actionId, actionDeps);
  };

  handleMenuActionRef.current = dispatchMenuAction;

  const currentFormatLabel = currentFormat
    ? FORMAT_LABEL_BY_TYPE[currentFormat]
    : "—";

  /* ──────────────────────── JSX ──────────────────────── */
  return (
    <div
      className="app-root selection:bg-[var(--brand)]/30 flex h-screen flex-col overflow-hidden bg-[var(--background)] font-['Cairo'] text-[var(--foreground)]"
      dir="rtl"
      data-testid="app-root"
    >
      <BackgroundGrid />

      <AppHeader
        menuSections={MENU_SECTIONS}
        activeMenu={activeMenu}
        onToggleMenu={(sectionLabel) =>
          setActiveMenu((prev) => (prev === sectionLabel ? null : sectionLabel))
        }
        onAction={(actionId) => {
          void dispatchMenuAction(actionId as MenuActionId);
        }}
        infoDotColor={semanticColors.info}
        brandGradient={gradients.jungle}
        onlineDotColor={brandColors.jungleGreen}
      />

      <div
        className="app-main relative z-10 flex flex-1 overflow-hidden"
        suppressHydrationWarning
      >
        <AppSidebar
          sections={SIDEBAR_SECTIONS}
          openSectionId={openSidebarItem}
          onToggleSection={(sectionId) =>
            setOpenSidebarItem((prev) =>
              prev === sectionId ? null : sectionId
            )
          }
          onItemAction={(sectionId, itemLabel) => {
            void handleSidebarItemAction(sectionId, itemLabel, actionDeps);
          }}
          settingsPanel={
            <SettingsPanel
              typingSystemSettings={typingSystemSettings}
              onTypingModeChange={handleTypingModeChange}
              onLiveIdleMinutesChange={handleLiveIdleMinutesChange}
              onRunExportClassified={() => {
                void runExport("classified", actionDeps, "النص_المصنف");
              }}
              onRunProcessNow={() => {
                void runDocumentThroughPasteWorkflow({
                  source: "manual-deferred",
                  reviewProfile: "interactive",
                  policyProfile: "strict-structure",
                });
              }}
              lockedEditorFontLabel={LOCKED_EDITOR_FONT_LABEL}
              lockedEditorSizeLabel={LOCKED_EDITOR_SIZE_LABEL}
              supportedLegacyFormatCount={SUPPORTED_LEGACY_FORMAT_COUNT}
              classifierOptionCount={CLASSIFIER_OPTION_COUNT}
              actionBlockSpacing={ACTION_BLOCK_SPACING}
              hasFileImportBackend={hasFileImportBackend}
            />
          }
        />

        <main className="app-editor-main relative flex flex-1 flex-col overflow-hidden">
          <AppDock
            buttons={DOCK_BUTTONS}
            isMobile={isMobile}
            onAction={(actionId) => {
              void dispatchMenuAction(actionId as MenuActionId);
            }}
          />

          <div className="app-editor-scroll scrollbar-none flex flex-1 justify-center overflow-y-auto p-8 pt-20">
            <div className="app-editor-shell relative -mt-4 w-full max-w-[850px] pb-20">
              <div
                ref={editorMountRef}
                className="editor-area app-editor-host"
                data-testid="editor-area"
              />
            </div>
          </div>
        </main>
      </div>

      <AppFooter
        stats={stats}
        currentFormatLabel={currentFormatLabel}
        isMobile={isMobile}
      />

      <PipelineMonitor
        visible={showPipelineMonitor}
        onClose={() => setShowPipelineMonitor(false)}
      />

      <div className="sr-only">
        {screenplayFormats.map((format) => (
          <span key={format.id}>{format.label}</span>
        ))}
      </div>
    </div>
  );
}
