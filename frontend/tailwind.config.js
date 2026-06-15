import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'ui-monospace', '"Cascadia Mono"', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Arial', 'sans-serif'],
        display: ['"Arial Narrow"', '"Roboto Condensed"', '"Segoe UI"', 'Arial', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        bloomberg: {
          bg: '#0a0a0a',
          surface: '#111111',
          card: '#161616',
          border: '#242424',
          'border-light': '#2e2e2e',
          orange: '#f97316',
          'orange-dim': 'rgba(249,115,22,0.12)',
          green: '#22c55e',
          'green-dim': 'rgba(34,197,94,0.12)',
          red: '#ef4444',
          'red-dim': 'rgba(239,68,68,0.12)',
          amber: '#eab308',
          'amber-dim': 'rgba(234,179,8,0.12)',
          blue: '#3b82f6',
          'blue-dim': 'rgba(59,130,246,0.12)',
          cyan: '#06b6d4',
          white: '#e5e5e5',
          muted: '#525252',
          subtle: '#3d3d3d',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        blink: 'blink 1s step-end infinite',
        marquee: 'marquee 30s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        'fade-up': 'fadeUp 0.4s ease both',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [animate],
};
