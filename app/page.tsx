"use client";

import { useEffect } from "react";
import { App } from "@/App";
import { createThemeProvider } from "@/providers";
import { createToaster } from "@/components/ui/toaster";

let initialized = false;

function initClientSideProviders() {
  if (initialized) return;
  initialized = true;

  createThemeProvider({
    attribute: "class",
    defaultTheme: "dark",
    enableSystem: false,
    storageKey: "filmlane.theme",
  });

  const toaster = createToaster();
  document.body.appendChild(toaster.element);
}

export default function HomePage() {
  useEffect(() => {
    initClientSideProviders();
  }, []);

  return <App />;
}
