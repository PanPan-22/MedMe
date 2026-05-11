/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./context/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-soft": "rgb(var(--color-primary-soft) / <alpha-value>)",
        background: "rgb(var(--color-background) / <alpha-value>)",
        card: "rgb(var(--color-card) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
      },
      // Bump lineHeight only on the larger headings where Tailwind's default
      // (≤1.33×) is too tight for bold Thai (e.g. ู in เข้าสู่ระบบ).
      // Smaller sizes already have 1.4-1.5× default leading and don't clip.
      fontSize: {
        "2xl": ["24px", "36px"],
        "3xl": ["30px", "42px"],
        "4xl": ["36px", "50px"],
        "5xl": ["48px", "66px"],
      },
    },
  },
  plugins: [],
};
