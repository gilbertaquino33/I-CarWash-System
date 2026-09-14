import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff5ff",
          100: "#dbe8fe",
          200: "#bfd7fe",
          300: "#93b8fd",
          400: "#5f90f9",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1a3fae",
          800: "#1b378b",
          900: "#1b3070",
        },
        ink: {
          50: "#f7f8f9",
          100: "#eceef1",
          200: "#dcdfe5",
          300: "#b9bfc9",
          400: "#8d95a3",
          500: "#68707f",
          600: "#4d5462",
          700: "#373d48",
          800: "#22262e",
          900: "#131519",
          950: "#08090b",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(8, 9, 11, 0.04), 0 8px 24px -12px rgba(8, 9, 11, 0.12)",
        lift: "0 2px 4px rgba(8, 9, 11, 0.04), 0 18px 40px -16px rgba(8, 9, 11, 0.22)",
        glow: "0 18px 50px -18px rgba(37, 99, 235, 0.55)",
      },
      backgroundImage: {
        grid: "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
