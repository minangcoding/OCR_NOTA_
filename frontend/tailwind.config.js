/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // --- 1. WARNA BAWAAN SHADCN/UI (TETAP AMAN) ---
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // --- 2. GABUNGAN WARNA SHADCN & DESAIN BARU ---
        // (Kita ubah DEFAULT-nya jadi warna baru, tapi foreground shadcn tetap dipertahankan)
        primary: {
          DEFAULT: "#b2001a", 
          foreground: "hsl(var(--primary-foreground))", 
        },
        secondary: {
          DEFAULT: "#565e74",
          foreground: "hsl(var(--secondary-foreground))",
        },

        // --- 3. WARNA TAMBAHAN KHUSUS DESAIN BARU ---
        "surface-container-highest": "#d3e4fe",
        surface: "#f8f9ff",
        "primary-container": "#d7262e",
        "on-primary-container": "#fff1f0",
        "tertiary-container": "#00799c",
        "outline-variant": "#e5bdba",
        tertiary: {
          DEFAULT: "#005f7b",
        },
        "on-background": "#0b1c30",
        "surface-container-high": "#dce9ff",
        "tertiary-fixed": "#bee9ff",
        "surface-container": "#e5eeff",
        "surface-container-low": "#eff4ff",
        "secondary-container": "#dae2fd",
        "surface-bright": "#f8f9ff",
        "surface-container-lowest": "#ffffff",
        "on-surface": "#0b1c30",
        "on-surface-variant": "#5c403d"
      },
      // --- FONT DARI DESAIN BARU ---
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Public Sans", "sans-serif"],
        h1: ["Public Sans", "sans-serif"],
        h2: ["Public Sans", "sans-serif"],
        h3: ["Public Sans", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "label-caps": ["Inter", "sans-serif"],
      },
      // --- BAWAAN ANIMASI SHADCN TETAP AMAN ---
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}