export const createUiPrimitive = (
  moduleName: string,
  text?: string
): HTMLElement => {
  const element = document.createElement("div");
  element.className = `ui-primitive ui-primitive--${moduleName}`;
  element.dataset.uiModule = moduleName;
  if (text) {
    element.textContent = text;
  }
  return element;
};

export const createUiButtonPrimitive = (
  moduleName: string,
  label = moduleName
): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ui-primitive-button ui-primitive-button--${moduleName}`;
  button.dataset.uiModule = moduleName;
  button.textContent = label;
  return button;
};
