import {
  dismissToast,
  subscribeToastState,
  type ToasterToast,
} from "../../hooks/use-toast";
import { createToastElement } from "./toast";

export class Toaster {
  readonly element: HTMLDivElement;

  private readonly listElement: HTMLDivElement;
  private readonly unsubscribe: () => void;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "ui-toaster";
    this.element.setAttribute("aria-live", "polite");
    this.element.setAttribute("aria-atomic", "true");

    this.listElement = document.createElement("div");
    this.listElement.className = "ui-toaster__list";
    this.element.appendChild(this.listElement);

    this.unsubscribe = subscribeToastState((state) => {
      this.render(state.toasts);
    });
  }

  destroy(): void {
    this.unsubscribe();
  }

  private render(toasts: readonly ToasterToast[]): void {
    this.listElement.innerHTML = "";

    for (const item of toasts) {
      const toastElement = createToastElement(item, (id) => dismissToast(id));
      this.listElement.appendChild(toastElement);
    }
  }
}

export const createToaster = (): Toaster => new Toaster();
