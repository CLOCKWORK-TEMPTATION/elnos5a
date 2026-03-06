import React from "react";
import type { DocumentStats } from "../editor/editor-area.types";

export interface AppFooterProps {
  stats: DocumentStats;
  currentFormatLabel: string;
  isMobile: boolean;
}

export function AppFooter({
  stats,
  currentFormatLabel,
  isMobile,
}: AppFooterProps): React.JSX.Element {
  return (
    <footer
      className="app-footer relative z-40 flex-shrink-0 border-t border-white/[0.04] bg-neutral-950/80 px-4 py-1 text-[11px] backdrop-blur-2xl"
      style={{ direction: "rtl" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-[var(--muted-foreground)]">
          <span>{stats.pages} صفحة</span>
          {!isMobile && (
            <span className="hidden sm:inline">{stats.words} كلمة</span>
          )}
          {!isMobile && (
            <span className="hidden md:inline">{stats.characters} حرف</span>
          )}
          <span className="hidden sm:inline">{stats.scenes} مشهد</span>
        </div>
        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
          <span>{currentFormatLabel}</span>
        </div>
      </div>
    </footer>
  );
}
