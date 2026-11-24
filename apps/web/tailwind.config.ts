import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        "background-secondary": "hsl(var(--background-secondary))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
        },
        lavender: {
          DEFAULT: "hsl(var(--lavender-card))",
          foreground: "hsl(var(--lavender-card-foreground))",
        },
        peach: {
          DEFAULT: "hsl(var(--peach-card))",
          foreground: "hsl(var(--peach-card-foreground))",
          highlight: "hsl(var(--peach-highlight))",
          "highlight-foreground": "hsl(var(--peach-highlight-foreground))",
        },
        lilac: "hsl(var(--lilac-accent))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        card: "1.125rem", // 18px
        button: "0.6875rem", // 11px
        lg: "1.125rem",
        md: "0.6875rem",
        sm: "0.5rem",
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgb(34 34 63 / 0.04), 0 1px 1px 0 rgb(34 34 63 / 0.03)",
        card: "0 2px 8px -2px rgb(117 104 216 / 0.08), 0 1px 3px -1px rgb(117 104 216 / 0.06)",
      },
      fontSize: {
        "heading-page": ["1.5rem", { lineHeight: "2rem", fontWeight: "700" }], // 24px
        "heading-section": ["1.0625rem", { lineHeight: "1.5rem", fontWeight: "600" }], // 17px
        body: ["0.8125rem", { lineHeight: "1.25rem" }], // 13px
        support: ["0.75rem", { lineHeight: "1rem" }], // 12px
      },
    },
  },
  plugins: [],
};

export default config;
