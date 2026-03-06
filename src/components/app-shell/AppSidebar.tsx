import React, { useMemo, useState } from "react";
import { HoverBorderGradient } from "../ui/hover-border-gradient";

export interface AppSidebarSection {
  id: string;
  label: string;
  icon: React.ElementType;
  items: readonly string[];
}

export interface AppSidebarProps {
  sections: readonly AppSidebarSection[];
  openSectionId: string | null;
  onToggleSection: (sectionId: string) => void;
  onItemAction: (sectionId: string, itemLabel: string) => void;
  settingsPanel: React.ReactNode;
}

export function AppSidebar({
  sections,
  openSectionId,
  onToggleSection,
  onItemAction,
  settingsPanel,
}: AppSidebarProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleSections = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        filteredItems:
          normalizedQuery.length === 0
            ? section.items
            : section.items.filter((item) =>
                item.toLowerCase().includes(normalizedQuery)
              ),
      })),
    [normalizedQuery, sections]
  );

  const hasAnySearchResult =
    normalizedQuery.length === 0 ||
    visibleSections.some(
      (section) => section.filteredItems.length > 0 || section.id === "settings"
    );

  return (
    <aside
      className="app-sidebar hidden w-72 flex-col p-6 lg:flex"
      data-testid="app-sidebar"
    >
      <HoverBorderGradient
        as="div"
        duration={1}
        containerClassName="h-full w-full rounded-3xl"
        className="flex h-full w-full flex-col items-stretch rounded-[inherit] bg-neutral-900/60 p-4 backdrop-blur-2xl"
      >
        <div className="group relative mb-8">
          <HoverBorderGradient
            as="div"
            duration={1}
            containerClassName="w-full rounded-xl group"
            className="flex w-full items-center gap-2 rounded-[inherit] bg-neutral-900/90 px-3 py-3"
          >
            <span className="size-4 text-center text-[var(--muted-foreground)] transition-colors group-focus-within:text-[var(--brand)]">
              ⌕
            </span>
            <input
              id="sidebar-search"
              name="sidebar-search"
              type="text"
              autoComplete="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              suppressHydrationWarning
              placeholder="بحث..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              data-testid="sidebar-search"
              className="w-full border-none bg-transparent text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none"
            />
            <kbd className="hidden rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 group-hover:block">
              ⌘K
            </kbd>
          </HoverBorderGradient>
        </div>

        <div className="space-y-2">
          {!hasAnySearchResult && (
            <div className="rounded-xl border border-white/10 bg-neutral-900/60 px-3 py-2 text-right text-xs text-neutral-400">
              لا توجد نتائج مطابقة للبحث.
            </div>
          )}

          {visibleSections.map((section) => {
            const SIcon = section.icon;
            const isOpen = openSectionId === section.id;
            const visibleItems = section.filteredItems;
            const hasItems = visibleItems.length > 0;
            const shouldRenderSection =
              normalizedQuery.length === 0 ||
              hasItems ||
              section.id === "settings";

            if (!shouldRenderSection) {
              return null;
            }

            return (
              <div key={section.id} className="mb-2">
                <HoverBorderGradient
                  as="button"
                  type="button"
                  duration={1}
                  containerClassName="w-full rounded-xl"
                  suppressHydrationWarning
                  className={`group flex w-full items-center gap-3 rounded-[inherit] bg-neutral-900/90 p-3 transition-all duration-200 ${
                    isOpen
                      ? "text-white"
                      : "text-neutral-500 hover:text-neutral-200"
                  }`}
                  onClick={() => onToggleSection(section.id)}
                >
                  <SIcon
                    className={`size-[18px] transition-colors ${
                      isOpen
                        ? "text-neutral-300"
                        : "text-neutral-500 group-hover:text-neutral-200"
                    }`}
                  />
                  <span className="flex-1 text-right text-sm font-medium">
                    {section.label}
                  </span>
                  {section.items.length > 0 && (
                    <span
                      className={`text-neutral-600 transition-transform duration-300 ${
                        isOpen ? "-rotate-90" : ""
                      }`}
                    >
                      {hasItems ? "‹" : "·"}
                    </span>
                  )}
                </HoverBorderGradient>

                {isOpen && hasItems && (
                  <div className="mt-2 space-y-1 pr-4">
                    {visibleItems.map((item) => (
                      <button
                        type="button"
                        suppressHydrationWarning
                        key={`${section.id}-${item}`}
                        onClick={() => onItemAction(section.id, item)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        <span className="h-1 w-1 rounded-full bg-neutral-600" />
                        {item}
                      </button>
                    ))}
                  </div>
                )}

                {isOpen &&
                  !hasItems &&
                  section.id !== "settings" &&
                  normalizedQuery.length > 0 && (
                    <div className="mt-2 rounded-lg border border-white/10 bg-neutral-900/60 px-3 py-2 text-right text-[11px] text-neutral-500">
                      لا توجد عناصر لهذا القسم حسب البحث الحالي.
                    </div>
                  )}

                {isOpen && section.id === "settings" && settingsPanel}
              </div>
            );
          })}
        </div>

        <div className="mt-auto">
          <HoverBorderGradient
            as="div"
            duration={1}
            containerClassName="w-full rounded-2xl"
            className="flex w-full flex-col items-start rounded-[inherit] bg-neutral-900/90 p-4"
          >
            <span className="text-primary mb-2 text-base">✦</span>
            <p className="text-xs font-light leading-relaxed text-[var(--muted-foreground)]">
              تم تفعيل وضع التركيز الذكي. استمتع بتجربة كتابة خالية من المشتتات.
            </p>
          </HoverBorderGradient>
        </div>
      </HoverBorderGradient>
    </aside>
  );
}
