export const createHoverCard = (
  content: HTMLElement | string,
  className = ""
): HTMLDivElement => {
  const card = document.createElement("div");
  card.className = `ui-hover-card ${className}`.trim();

  if (typeof content === "string") {
    const text = document.createElement("p");
    text.textContent = content;
    card.appendChild(text);
  } else {
    card.appendChild(content);
  }

  return card;
};
