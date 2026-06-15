"use client";

import React from "react";
import { useTheme } from "./ThemeProvider";

interface ThemeToggleProps {
  className?: string;
}

/**
 * ThemeToggle — Animated sun/moon toggle for switching light/dark/system themes.
 * Cycles: light → dark → system on each click.
 */
export default function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, setTheme, isDark } = useTheme();

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const icon = theme === "light" ? "light_mode" : theme === "dark" ? "dark_mode" : "contrast";
  const label = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Auto";

  return (
    <button
      onClick={cycle}
      className={`
        relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold
        transition-all duration-300 select-none
        bg-surface-container-high hover:bg-surface-container-highest
        text-on-surface-variant hover:text-on-surface
        border border-outline-variant/30 hover:border-outline-variant
        active:scale-95
        ${className}
      `}
      aria-label={`Theme: ${label}. Click to change.`}
      title={`Current: ${label} theme`}
    >
      <span
        className={`
          material-symbols-outlined text-lg
          transition-transform duration-500
          ${isDark ? "rotate-[360deg]" : "rotate-0"}
        `}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {icon}
      </span>
      <span className="text-xs hidden sm:inline">{label}</span>
    </button>
  );
}
