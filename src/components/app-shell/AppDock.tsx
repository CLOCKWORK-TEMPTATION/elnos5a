import React from "react";
import { HoverBorderGradient } from "../ui/hover-border-gradient";

export interface AppDockButtonItem {
  actionId: string;
  icon: React.ElementType;
  title: string;
}

export interface AppDockProps {
  buttons: readonly AppDockButtonItem[];
  onAction: (actionId: string) => void;
  isMobile: boolean;
}

function DockIconButton({
  icon: Icon,
  title,
  onClick,
  isMobile,
}: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  isMobile: boolean;
}): React.JSX.Element {
  return (
    <div
      className={`relative z-10 flex items-center justify-center ${isMobile ? "h-9 w-9" : "h-10 w-10"}`}
    >
      <HoverBorderGradient
        as="button"
        type="button"
        suppressHydrationWarning
        onClick={onClick}
        title={title}
        containerClassName="h-full w-full rounded-full"
        className="flex h-full w-full items-center justify-center rounded-[inherit] bg-neutral-900/90 p-0 text-neutral-400 transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
        duration={1}
      >
        <Icon
          className={isMobile ? "size-4" : "size-[18px]"}
          strokeWidth={1.75}
        />
      </HoverBorderGradient>
    </div>
  );
}

export function AppDock({
  buttons,
  onAction,
  isMobile,
}: AppDockProps): React.JSX.Element {
  const visibleButtons = isMobile
    ? buttons.filter((_, index) =>
        [0, 1, 6, 7, 8, 9, 10, 11, 14].includes(index)
      )
    : buttons;

  return (
    <div className="app-dock pointer-events-none absolute left-0 right-0 top-0 z-40 flex justify-center pt-3">
      <div className="pointer-events-auto">
        <HoverBorderGradient
          as="div"
          duration={1}
          containerClassName="mx-auto rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
          className={`flex items-end rounded-[inherit] bg-neutral-950/80 backdrop-blur-2xl ${
            isMobile ? "h-14 gap-2 px-3 pb-2" : "h-16 gap-3.5 px-5 pb-3"
          }`}
        >
          {visibleButtons.map((button, index) => {
            const showSeparator =
              !isMobile &&
              (index === 1 || index === 3 || index === 7 || index === 13);
            return (
              <React.Fragment key={`${button.title}-${index}`}>
                <DockIconButton
                  icon={button.icon}
                  title={button.title}
                  isMobile={isMobile}
                  onClick={() => onAction(button.actionId)}
                />
                {showSeparator && (
                  <div className="mx-3 mb-4 h-5 w-px bg-gradient-to-b from-transparent via-neutral-600/50 to-transparent" />
                )}
              </React.Fragment>
            );
          })}
        </HoverBorderGradient>
      </div>
    </div>
  );
}
