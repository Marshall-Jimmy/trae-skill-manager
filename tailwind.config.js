/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        trae: {
          bg: 'rgb(var(--trae-bg) / <alpha-value>)',
          sidebar: 'rgb(var(--trae-sidebar) / <alpha-value>)',
          card: 'rgb(var(--trae-card) / <alpha-value>)',
          'card-hover': 'rgb(var(--trae-card-hover) / <alpha-value>)',
          accent: 'rgb(var(--trae-accent) / <alpha-value>)',
          'accent-deep': 'rgb(var(--trae-accent-deep) / <alpha-value>)',
          text: '#f0f0f5',
          'text-secondary': '#6b7280',
          success: 'rgb(var(--trae-accent) / <alpha-value>)',
          danger: '#ff4444',
          border: '#000000',
          'border-hover': '#1a1a1a',
        },
      },
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '9999px',
      },
      boxShadow: {
        hard: '4px 4px 0 0 #000000',
        'hard-sm': '2px 2px 0 0 #000000',
        'hard-lg': '6px 6px 0 0 #000000',
        'hard-accent': '4px 4px 0 0 rgba(0, 255, 136, 0.35)',
      },
    },
  },
  plugins: [],
}
