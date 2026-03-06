import { createDropdownMenu } from "./dropdown-menu";

export interface NavigationMenuSection<T extends string = string> {
  label: string;
  actions: readonly { id: T; label: string }[];
}

export const createNavigationMenu = <T extends string>(
  sections: readonly NavigationMenuSection<T>[],
  onAction: (actionId: T) => void
): HTMLElement => {
  const nav = document.createElement("nav");
  nav.className = "ui-navigation-menu";

  for (const section of sections) {
    const dropdown = createDropdownMenu({
      label: section.label,
      actions: section.actions,
      onAction,
    });
    nav.appendChild(dropdown);
  }

  return nav;
};
