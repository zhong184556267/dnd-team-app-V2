/** @type {import('tailwindcss').Config} */
export default {
  safelist: [
    'text-[#B8860B]',
    'text-[#D4AF37]',
    'border-[#B8860B]',
    'border-2',
    'text-[#E01C2F]',
    'text-sky-400',
    'text-gray-500',
    'border-l-[3px]',
    'border-l-[#B8860B]',
    'border-l-[#E01C2F]',
    'border-l-[#38BDF8]',
    'border-l-gray-500',
    'drop-shadow-[0_0_5px_rgba(184,134,11,0.5)]',
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
        /* D&D Beyond Dark Theme — 暗金主色 + 亮金文字 + 红高亮 */
        'dnd': {
          bg: '#121212',
          'bg-alt': '#1A202C',
          card: '#1E293B',
          'card-hover': '#2D3748',
          red: '#E01C2F',
          'red-hover': '#C41828',
          gold: '#B8860B',
          'gold-light': '#D4AF37',
          success: '#48BB78',
          warning: '#ED8936',
          'text-value': '#FFFFFF',
          'text-label': '#A0AEC0',
          'text-muted': '#718096',
        },
        /* 兼容旧类名：暗金 / 亮金 */
        'dnd-bg': '#121212',
        'dnd-card': '#1E293B',
        'dnd-gold': '#B8860B',
        'dnd-gold-light': '#D4AF37',
        'dnd-text': {
          title: '#FFFFFF',
          body: '#CBD5E0',
          muted: '#718096',
        },
        parchment: { DEFAULT: '#2D3748', dark: '#1E293B', light: '#4A5568' },
        stone: { dark: '#1A202C', DEFAULT: '#A0AEC0', light: '#718096' },
        accent: { gold: '#B8860B', 'gold-light': '#D4AF37', copper: '#E01C2F' },
      },
      letterSpacing: {
        'label': '0.12em',
      },
      boxShadow: {
        'dnd-card': '0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2)',
        'dnd-card-hover': '0 10px 15px -3px rgb(0 0 0 / 0.35), 0 4px 6px -4px rgb(0 0 0 / 0.25)',
        'dnd-glow': '0 0 12px rgba(224, 28, 47, 0.4)',
        'dnd-gold-glow': '0 0 8px rgba(184, 134, 11, 0.6)',
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
