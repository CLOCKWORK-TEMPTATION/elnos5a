export interface BackgroundRippleEffectOptions {
  rows?: number;
  cols?: number;
  cellSize?: number;
  className?: string;
}

export const createBackgroundRippleEffect = (
  options: BackgroundRippleEffectOptions = {}
): HTMLElement => {
  const rows = options.rows ?? 12;
  const cols = options.cols ?? 16;
  const cellSize = options.cellSize ?? 48;

  const root = document.createElement("div");
  root.className = `ui-background-ripple ${options.className ?? ""}`.trim();
  root.style.setProperty("--ripple-cell-size", `${cellSize}px`);
  root.style.setProperty("--ripple-rows", `${rows}`);
  root.style.setProperty("--ripple-cols", `${cols}`);

  for (let i = 0; i < rows * cols; i++) {
    const cell = document.createElement("span");
    cell.className = "ui-background-ripple__cell";
    cell.style.setProperty("--cell-delay", `${(i % cols) * 20}ms`);
    root.appendChild(cell);
  }

  root.addEventListener("pointermove", (event) => {
    const rect = root.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    root.style.setProperty("--ripple-x", `${x}%`);
    root.style.setProperty("--ripple-y", `${y}%`);
  });

  return root;
};
