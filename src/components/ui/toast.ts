export type ToastVariant = "default" | "destructive";

export interface ToastActionElement {
  label: string;
  onClick?: () => void;
}

export interface ToastProps {
  open?: boolean;
  duration?: number;
  variant?: ToastVariant;
  onOpenChange?: (open: boolean) => void;
}

export interface ToastRenderPayload extends ToastProps {
  id: string;
  title?: string;
  description?: string;
  action?: ToastActionElement;
}

export const createToastElement = (
  payload: ToastRenderPayload,
  onDismiss: (id: string) => void
): HTMLElement => {
  const root = document.createElement("article");
  root.className = `ui-toast ui-toast--${payload.variant ?? "default"}`;
  root.dataset.toastId = payload.id;

  const content = document.createElement("div");
  content.className = "ui-toast__content";

  if (payload.title) {
    const title = document.createElement("h4");
    title.className = "ui-toast__title";
    title.textContent = payload.title;
    content.appendChild(title);
  }

  if (payload.description) {
    const description = document.createElement("p");
    description.className = "ui-toast__description";
    description.textContent = payload.description;
    content.appendChild(description);
  }

  const actions = document.createElement("div");
  actions.className = "ui-toast__actions";

  if (payload.action) {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "ui-toast__action-btn";
    actionButton.textContent = payload.action.label;
    actionButton.addEventListener("click", () => {
      payload.action?.onClick?.();
      payload.onOpenChange?.(false);
      onDismiss(payload.id);
    });
    actions.appendChild(actionButton);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ui-toast__close-btn";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Dismiss notification");
  closeButton.addEventListener("click", () => {
    payload.onOpenChange?.(false);
    onDismiss(payload.id);
  });

  actions.appendChild(closeButton);

  root.appendChild(content);
  root.appendChild(actions);

  return root;
};
