"use client";

import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";

/**
 * SplashScreen — branded loading overlay shown on first paint.
 * Renders identically on server and client (no hydration mismatch), animates a
 * loading bar to full, then fades out and unmounts.
 */
export default function SplashScreen() {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Fill the bar (CSS width transition animates it), then fade + unmount.
    const t1 = setTimeout(() => setProgress(100), 60);
    const t2 = setTimeout(() => setFading(true), 1700);
    const t3 = setTimeout(() => setGone(true), 2250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 bg-surface transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-3 animate-[fadeIn_0.5s_ease-out]">
        <BrandMark className="w-16 h-20" />
        <div className="text-center">
          <h1 className="text-xl font-bold text-on-surface tracking-tight">SugboWay</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">Cebu transit, made simple</p>
        </div>
      </div>

      {/* Loading bar */}
      <div className="w-44 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
        <div
          className="h-full rounded-full bg-cebu-blue transition-[width] duration-[1600ms] ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
