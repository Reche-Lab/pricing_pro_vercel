import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./docs/**/*.{md,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18181b",
        paper: "#fafafa",
        brand: "#c27121"
      }
    }
  },
  plugins: []
};

export default config;
