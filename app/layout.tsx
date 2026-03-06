import type { Metadata } from "next";
import "@/styles/system.css";

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: "أفان تيتر - محرر السيناريو السينمائي",
  description:
    "محرر سيناريو سينمائي احترافي للكتابة العربية مع دعم التصنيف الذكي.",
  keywords: "سيناريو, كتابة سينمائية, محرر عربي, أفان تيتر, النسخة",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <meta name="theme-color" content="#029784" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
