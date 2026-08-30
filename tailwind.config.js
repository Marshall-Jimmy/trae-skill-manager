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
          bg: '#0a0a0f',
          sidebar: '#111118',
          card: '#16161d',
          'card-hover': '#1c1c24',
          accent: '#00ff88',
          'accent-deep': '#00cc6a',
          text: '#f0f0f5',
          'text-secondary': '#6b7280',
          success: '#00ff88',
          danger: '#ff4444',
          border: '#1f1f28',
          'border-hover': '#2a2a35',
        },
      },
    },
  },
  plugins: [],
}
