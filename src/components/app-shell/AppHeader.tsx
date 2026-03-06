import React from "react";
import { User } from "lucide-react";
import { HoverBorderGradient } from "../ui/hover-border-gradient";

export interface AppShellMenuItem {
  label: string;
  actionId: string;
  shortcut?: string;
  icon?: React.ElementType;
  iconGlyph?: string;
  disabled?: boolean;
}

export interface AppShellMenuSection {
  label: string;
  items: readonly AppShellMenuItem[];
}

export interface AppHeaderProps {
  menuSections: readonly AppShellMenuSection[];
  activeMenu: string | null;
  onToggleMenu: (sectionLabel: string) => void;
  onAction: (actionId: string) => void;
  infoDotColor: string;
  brandGradient: string;
  onlineDotColor: string;
}

export function AppHeader({
  menuSections,
  activeMenu,
  onToggleMenu,
  onAction,
  infoDotColor,
  brandGradient,
  onlineDotColor,
}: AppHeaderProps): React.JSX.Element {
  const toTestId = (value: string): string =>
    value.trim().toLowerCase().replace(/\s+/g, "-");

  return (
    <header
      className="app-header bg-[var(--card)]/80 relative z-40 flex h-[60px] flex-shrink-0 items-center justify-between px-7 backdrop-blur-2xl"
      data-testid="app-header"
    >
      <div className="flex items-center gap-3">
        <HoverBorderGradient
          as="div"
          duration={1}
          containerClassName="h-11 rounded-full"
          className="flex h-full items-center gap-1.5 rounded-[inherit] bg-neutral-950/80 p-1.5 backdrop-blur-2xl"
        >
          <HoverBorderGradient
            as="div"
            duration={1}
            containerClassName="h-full rounded-full"
            className="flex h-full items-center gap-2.5 rounded-[inherit] bg-neutral-900/90 px-5"
          >
            <span
              className="h-1.5 w-1.5 rounded-full shadow-[0_0_6px_rgba(15,76,138,0.5)]"
              style={{ backgroundColor: infoDotColor }}
            />
            <span
              className="bg-clip-text text-[15px] font-bold text-transparent transition-all duration-300"
              style={{ backgroundImage: brandGradient }}
            >
              أفان تيتر
            </span>
          </HoverBorderGradient>
        </HoverBorderGradient>

        <div
          className="relative z-50 flex h-11 items-center gap-1 rounded-full border border-white/10 bg-neutral-950/90 p-1 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
          data-app-menu-root="true"
        >
          {menuSections.map((section) => (
            <div
              key={section.label}
              className="group relative h-full"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <button
                type="button"
                className={`flex h-full min-w-[72px] items-center justify-center rounded-full px-4 text-[13px] font-medium transition-all ${
                  activeMenu === section.label
                    ? "bg-neutral-800 text-white"
                    : "bg-transparent text-neutral-400 hover:bg-neutral-900 hover:text-white group-hover:text-white"
                }`}
                onClick={() => onToggleMenu(section.label)}
                data-testid={`menu-section-${toTestId(section.label)}`}
              >
                {section.label}
              </button>

              {activeMenu === section.label && (
                <div className="absolute right-0 top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 p-1.5 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
                  {section.items.map((item) => (
                    <button
                      type="button"
                      key={`${section.label}-${item.label}`}
                      disabled={item.disabled}
                      onClick={() => onAction(item.actionId)}
                      data-testid={`menu-action-${item.actionId}`}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-[13px] transition-colors ${
                        item.disabled
                          ? "cursor-not-allowed text-neutral-600"
                          : "text-neutral-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="flex-1 text-right">{item.label}</span>
                      {item.shortcut && (
                        <span className="text-[10px] text-neutral-500">
                          {item.shortcut}
                        </span>
                      )}
                      {item.iconGlyph && (
                        <span className="w-4 text-center text-[13px] text-neutral-400">
                          {item.iconGlyph}
                        </span>
                      )}
                      {item.icon && (
                        <item.icon className="size-4 text-neutral-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <HoverBorderGradient
        as="div"
        duration={1}
        containerClassName="h-11 rounded-full"
        className="flex h-full items-center gap-1.5 rounded-[inherit] bg-neutral-950/80 p-1.5 backdrop-blur-2xl"
      >
        <HoverBorderGradient
          as="div"
          duration={1}
          containerClassName="h-full rounded-full"
          className="text-ring flex h-full items-center gap-2 rounded-[inherit] bg-neutral-900/90 px-4 text-[11px] font-bold uppercase tracking-wider"
        >
          <span className="bg-ring h-1.5 w-1.5 animate-pulse rounded-full" />
          Online
        </HoverBorderGradient>

        <HoverBorderGradient
          as="div"
          duration={1}
          containerClassName="h-full w-8 cursor-pointer rounded-full"
          className="flex h-full w-full items-center justify-center rounded-[inherit] bg-neutral-900/90 p-0"
        >
          <User className="size-4 text-neutral-300" />
        </HoverBorderGradient>

        <HoverBorderGradient
          as="div"
          duration={1}
          containerClassName="group h-full cursor-pointer rounded-full"
          className="flex h-full items-center gap-2.5 rounded-[inherit] bg-neutral-900/90 px-5 leading-none"
        >
          <span
            className="bg-clip-text text-[15px] font-bold text-transparent transition-all duration-300"
            style={{ backgroundImage: brandGradient }}
          >
            النسخة
          </span>
          <span className="flex h-1.5 w-1.5">
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: onlineDotColor }}
            />
          </span>
        </HoverBorderGradient>
      </HoverBorderGradient>
    </header>
  );
}
