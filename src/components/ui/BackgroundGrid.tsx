"use client";

import React from "react";
import { brandColors, semanticColors } from "../../constants";

/** مكون خلفية الشبكة الزخرفية — يعرض شبكة نقطية مع توهجات ضبابية ملونة */
export const BackgroundGrid = (): React.JSX.Element => (
  <div className="app-bg-grid pointer-events-none fixed inset-0 z-0">
    <div className="absolute inset-0 bg-neutral-950 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
    <div
      className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full opacity-20 blur-[100px]"
      style={{ backgroundColor: semanticColors.info }}
    />
    <div
      className="absolute bottom-0 right-0 -z-10 m-auto h-[310px] w-[310px] rounded-full opacity-20 blur-[100px]"
      style={{ backgroundColor: brandColors.jungleGreen }}
    />
  </div>
);
