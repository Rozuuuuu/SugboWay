module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "cebu-blue": "rgb(var(--cebu-blue) / <alpha-value>)",
        enamel: "rgb(var(--enamel) / <alpha-value>)",
        "enamel-deep": "rgb(var(--enamel-deep) / <alpha-value>)",
        "safe-green": "rgb(var(--safe-green) / <alpha-value>)",
        "alert-amber": "rgb(var(--alert-amber) / <alpha-value>)",
        "aircon-cyan": "rgb(var(--aircon-cyan) / <alpha-value>)",
        clay: "rgb(var(--clay) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-container": "rgb(var(--surface-container) / <alpha-value>)",
        "surface-container-lowest": "rgb(var(--surface-container-lowest) / <alpha-value>)",
        "surface-variant": "rgb(var(--surface-variant) / <alpha-value>)",
        "on-surface": "rgb(var(--on-surface) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--on-surface-variant) / <alpha-value>)",
        outline: "rgb(var(--outline) / <alpha-value>)",
        "outline-variant": "rgb(var(--outline-variant) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["HankenGrotesk_400Regular"],
        "sans-semibold": ["HankenGrotesk_600SemiBold"],
        display: ["SairaCondensed_600SemiBold"],
        mono: ["JetBrainsMono_500Medium"],
      },
    },
  },
  plugins: [],
};
