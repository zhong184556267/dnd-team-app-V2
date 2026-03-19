/** @type {import('tailwindcss').Config} */
export default {
  safelist: [
    'text-[#c79a42]',
    'text-[#c79a42]',
    'border-[#c79a42]',
    'border-2',
    'text-[#E01C2F]',
    'text-sky-400',
    'text-gray-500',
    'border-l-[3px]',
    'border-l-[#e9b343]',
    'border-l-[#E01C2F]',
    'border-l-[#38BDF8]',
    'border-l-gray-500',
    'drop-shadow-[0_0_5px_rgba(199,154,66,0.45)]',
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
          bg: '#141b27',
          'bg-alt': '#1a2538',
          card: '#1d2737',
          'card-hover': '#223047',
          red: '#E01C2F',
          'red-hover': '#C41828',
          gold: '#c79a42',
          'gold-light': '#c79a42',
          success: '#48BB78',
          warning: '#ED8936',
          'text-value': '#FFFFFF',
          'text-label': '#9ca3af',
          'text-muted': '#9ca3af',
        },
        'dnd-bg': '#141b27',
        'dnd-card': '#1d2737',
        'dnd-gold': '#c79a42',
        'dnd-gold-light': '#c79a42',
        'dnd-text': {
          title: '#FFFFFF',
          body: '#e5e7eb',
          muted: '#9ca3af',
        },
        parchment: { DEFAULT: '#2d323e', dark: '#1e222b', light: '#3d4554' },
        stone: { dark: '#1a1e26', DEFAULT: '#9ca3af', light: '#6b7280' },
        accent: { gold: '#c79a42', 'gold-light': '#c79a42', copper: '#E01C2F' },
        'shell-side': '#141b27',
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
        'dnd-gold-glow': '0 0 8px rgba(199, 154, 66, 0.45)',
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
