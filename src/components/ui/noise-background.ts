export const createNoiseBackground = (className = ""): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = `ui-noise-background ${className}`.trim();
  return element;
};
