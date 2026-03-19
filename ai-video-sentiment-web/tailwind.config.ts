import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...fontFamily.sans],
      },
      colors: {
        // Semantic tokens — maps to CSS vars in globals.css
        background: "var(--color-bg)",
        surface: "var(--color-surface)",
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
        },
        positive: {
          DEFAULT: "var(--color-positive)",
          subtle: "var(--color-positive-subtle)",
          border: "var(--color-positive-border)",
        },
        review: {
          DEFAULT: "var(--color-review)",
          subtle: "var(--color-review-subtle)",
          border: "var(--color-review-border)",
        },
        negative: {
          DEFAULT: "var(--color-negative)",
          subtle: "var(--color-negative-subtle)",
          border: "var(--color-negative-border)",
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          subtle: "var(--color-muted-subtle)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
