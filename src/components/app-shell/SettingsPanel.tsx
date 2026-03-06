"use client";

import React from "react";
import {
  TYPING_MODE_OPTIONS,
  toLiveIdleMinutesLabel,
} from "../../constants/format-mappings";
import type { TypingSystemSettings } from "../../types";

interface SettingsPanelProps {
  typingSystemSettings: TypingSystemSettings;
  onTypingModeChange: (
    nextMode: TypingSystemSettings["typingSystemMode"]
  ) => void;
  onLiveIdleMinutesChange: (nextMinutes: number) => void;
  onRunExportClassified: () => void;
  onRunProcessNow: () => void;
  lockedEditorFontLabel: string;
  lockedEditorSizeLabel: string;
  supportedLegacyFormatCount: number;
  classifierOptionCount: number;
  actionBlockSpacing: string;
  hasFileImportBackend: boolean;
  hasAgentReviewBackend: boolean;
}

export function SettingsPanel({
  typingSystemSettings,
  onTypingModeChange,
  onLiveIdleMinutesChange,
  onRunExportClassified,
  onRunProcessNow,
  lockedEditorFontLabel,
  lockedEditorSizeLabel,
  supportedLegacyFormatCount,
  classifierOptionCount,
  actionBlockSpacing,
  hasFileImportBackend,
  hasAgentReviewBackend,
}: SettingsPanelProps): React.JSX.Element {
  const activeTypingMode = TYPING_MODE_OPTIONS.find(
    (option) => option.value === typingSystemSettings.typingSystemMode
  );

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-white/10 bg-neutral-900/70 p-3 text-right">
      <div className="space-y-1">
        <label className="block text-xs font-semibold text-neutral-200">
          وضع نظام الكتابة
        </label>
        <select
          className="w-full rounded-lg border border-white/10 bg-neutral-950/80 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-[var(--brand)]"
          value={typingSystemSettings.typingSystemMode}
          onChange={(event) =>
            onTypingModeChange(
              event.target.value as TypingSystemSettings["typingSystemMode"]
            )
          }
        >
          {TYPING_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-neutral-400">
          {activeTypingMode?.description ?? ""}
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-neutral-300">
          <span>
            {toLiveIdleMinutesLabel(typingSystemSettings.liveIdleMinutes)}
          </span>
          <span>مهلة المعالجة الحية</span>
        </div>
        <input
          type="range"
          min={1}
          max={15}
          step={1}
          value={typingSystemSettings.liveIdleMinutes}
          onChange={(event) =>
            onLiveIdleMinutesChange(Number(event.target.value))
          }
          className="w-full accent-[var(--brand)]"
        />
        <div className="flex items-center justify-between text-[10px] text-neutral-500">
          <span>1</span>
          <span>15</span>
        </div>
      </div>

      <button
        type="button"
        className="bg-[var(--brand-teal)]/20 w-full rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-[var(--brand-teal)] transition-colors hover:bg-[var(--brand-teal)] hover:text-white"
        onClick={onRunExportClassified}
      >
        موافقة واعتماد النص (تصدير)
      </button>

      <button
        type="button"
        className="w-full rounded-lg border border-white/10 bg-neutral-950/80 px-3 py-2 text-xs text-neutral-200 transition-colors hover:border-[var(--brand)] hover:text-white"
        onClick={onRunProcessNow}
      >
        تشغيل المعالجة الآن
      </button>

      <div className="space-y-1 rounded-lg border border-white/10 bg-neutral-950/70 px-3 py-2 text-[10px] text-neutral-400">
        <div className="flex items-center justify-between">
          <span>{lockedEditorFontLabel}</span>
          <span>الخط النشط</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{lockedEditorSizeLabel}pt</span>
          <span>الحجم النشط</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{supportedLegacyFormatCount}</span>
          <span>تنسيقات مدعومة</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{classifierOptionCount}</span>
          <span>خيارات التصنيف</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{actionBlockSpacing}</span>
          <span>تباعد الحدث→الحدث</span>
        </div>
      </div>

      <div className="space-y-1 text-[10px] text-neutral-400">
        <div className="flex items-center justify-between">
          <span
            className={`h-2 w-2 rounded-full ${hasFileImportBackend ? "bg-emerald-400" : "bg-amber-400"}`}
          />
          <span>
            Backend File Extract:{" "}
            {hasFileImportBackend ? "Configured" : "Not configured"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span
            className={`h-2 w-2 rounded-full ${hasAgentReviewBackend ? "bg-emerald-400" : "bg-amber-400"}`}
          />
          <span>
            Agent Review Route:{" "}
            {hasAgentReviewBackend ? "Reachable by config" : "Not configured"}
          </span>
        </div>
      </div>
    </div>
  );
}
