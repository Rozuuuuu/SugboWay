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
      <div className="flex flex-col items-center gap-4 animate-[fadeIn_0.5s_ease-out]">
        <div className="sw-brand-tile w-20 h-20 flex items-center justify-center">
          <BrandMark className="w-11 h-14" mono />
        </div>
        <div className="text-center">
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-[0.14em] text-on-surface">
            SugboWay
          </h1>
          <p className="text-[11px] font-semibold text-on-surface-variant mt-1.5 uppercase tracking-[0.22em]">
            Cebu transit
          </p>
        </div>
      </div>

      {/* Loading rule — a flat enamel bar filling a steel track */}
      <div className="w-44 h-1 bg-surface-container-highest overflow-hidden">
        <div
          className="h-full transition-[width] duration-[1600ms] ease-out"
          style={{ width: `${progress}%`, background: "var(--sw-enamel)" }}
        />
      </div>
    </div>
  );
}
