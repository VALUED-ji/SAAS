import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#edf4ff",
          100: "#dce8ff",
          200: "#cfe0ff",
          300: "#afc6ff",
          400: "#7fa2ff",
          500: "#407aff",
          600: "#407aff",
          700: "#407aff",
          800: "#2f66e8",
          900: "#1f43b6",
        },
        accent: {
          50: "#ecfdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
        },
        surface: {
          50: "#f7f9fc",
          100: "#eef2f6",
          200: "#dfe6ee",
          300: "#cbd5df",
          400: "#95a2b1",
          500: "#647180",
          600: "#4a5563",
          700: "#323d4a",
          800: "#1f2935",
          900: "#131a23",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"PingFang SC"',
          '"Noto Sans SC"',
          '"Microsoft YaHei"',
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
