/** @type {import('tailwindcss').Config} */
export default {
  safelist: [
    'text-[#e9b343]',
    'text-[#f0c14d]',
    'border-[#e9b343]',
    'border-2',
    'text-[#E01C2F]',
    'text-sky-400',
    'text-gray-500',
    'border-l-[3px]',
    'border-l-[#e9b343]',
    'border-l-[#E01C2F]',
    'border-l-[#38BDF8]',
    'border-l-gray-500',
    'drop-shadow-[0_0_5px_rgba(233,179,67,0.5)]',
  ],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.css",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans SC', 'Source Han Sans SC', 'Source Han Sans', 'sans-serif'],
        display: ['Noto Sans SC', 'Source Han Sans SC', 'Source Han Sans', 'sans-serif'],
        body: ['Noto Sans SC', 'Source Han Sans SC', 'Source Han Sans', 'sans-serif'],
        mono: ['Noto Sans SC', 'Source Han Sans SC', 'Source Han Sans', 'sans-serif'],
        serif: ['Noto Sans SC', 'Source Han Sans SC', 'Source Han Sans', 'sans-serif'],
      },
      colors: {
        /* 参考图：深海军蓝底 + 金黄强调 + 红主操作 */
        'dnd': {
          bg: '#12141a',
          'bg-alt': '#1e222b',
          card: '#1e222b',
          'card-hover': '#252a33',
          red: '#E01C2F',
          'red-hover': '#C41828',
          gold: '#e9b343',
          'gold-light': '#f0c14d',
          success: '#48BB78',
          warning: '#ED8936',
          'text-value': '#FFFFFF',
          'text-label': '#9ca3af',
          'text-muted': '#9ca3af',
        },
        'dnd-bg': '#12141a',
        'dnd-card': '#1e222b',
        'dnd-gold': '#e9b343',
        'dnd-gold-light': '#f0c14d',
        'dnd-text': {
          title: '#FFFFFF',
          body: '#e5e7eb',
          muted: '#9ca3af',
        },
        parchment: { DEFAULT: '#2d323e', dark: '#1e222b', light: '#3d4554' },
        stone: { dark: '#1a1e26', DEFAULT: '#9ca3af', light: '#6b7280' },
        accent: { gold: '#e9b343', 'gold-light': '#f0c14d', copper: '#E01C2F' },
        'shell-side': '#0f1218',
      },
      borderRadius: {
        'panel': '8px',
      },
      maxWidth: {
        'app-shell': '1180px',
      },
      letterSpacing: {
        'label': '0.12em',
      },
      boxShadow: {
        'dnd-card': '0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2)',
        'dnd-card-hover': '0 10px 15px -3px rgb(0 0 0 / 0.35), 0 4px 6px -4px rgb(0 0 0 / 0.25)',
        'dnd-glow': '0 0 12px rgba(224, 28, 47, 0.4)',
        'dnd-gold-glow': '0 0 8px rgba(233, 179, 67, 0.5)',
      },
      keyframes: {
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-4px)' }, '75%': { transform: 'translateX(4px)' } },
        flash: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.7' } },
      },
      animation: {
        shake: 'shake 0.2s ease-in-out 2',
        flash: 'flash 0.3s ease-out',
      },
    },
  },
  plugins: [],
}
