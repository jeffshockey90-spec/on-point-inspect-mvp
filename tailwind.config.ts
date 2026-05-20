import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        onpoint: {
          dark: "#050708",
          panel: "#101820",
          teal: "#00B8A9",
          light: "#F8FAFC"
        }
      }
    }
  },
  plugins: [],
};
export default config;
