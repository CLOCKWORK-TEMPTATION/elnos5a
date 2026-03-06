export interface DropdownMenuAction<T extends string = string> {
  id: T;
  label: string;
}

export interface DropdownMenuOptions<T extends string = string> {
  label: string;
  actions: readonly DropdownMenuAction<T>[];
  className?: string;
  onAction: (actionId: T) => void;
}

export const createDropdownMenu = <T extends string>(
  options: DropdownMenuOptions<T>
): HTMLDetailsElement => {
  const details = document.createElement("details");
  details.className = `ui-dropdown-menu ${options.className ?? ""}`.trim();

  const summary = document.createElement("summary");
  summary.className = "ui-dropdown-menu__trigger";
  summary.textContent = options.label;

  const panel = document.createElement("div");
  panel.className = "ui-dropdown-menu__panel";

  for (const action of options.actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ui-dropdown-menu__item";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      options.onAction(action.id);
      details.removeAttribute("open");
    });
    panel.appendChild(button);
  }

  details.appendChild(summary);
  details.appendChild(panel);
  return details;
};
