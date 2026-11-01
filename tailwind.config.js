/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#03060d',
          900: '#060b16',
          850: '#0a1322',
          800: '#0e1a2e',
          700: '#15243d',
          600: '#1e3354',
          500: '#2b4670',
        },
        ink: {
          50: '#f2f8ff',
          100: '#dbe7f5',
          200: '#b3c5dc',
          300: '#8ea4c0',
          400: '#7d93b0',
          500: '#63789a',
        },
        neon: { 300: '#c4f4ff', 400: '#5ee7ff', 500: '#22d3ff', 600: '#0aa9dc' },
        volt: { 300: '#a9c8ff', 400: '#6fa5ff', 500: '#3d80ff', 600: '#2360e0' },
        aqua: { 300: '#c5f7ff', 400: '#8cefff', 500: '#3ad6f2' },
        amber: { 300: '#ffe9a3', 400: '#ffd45c', 500: '#f5b82e' },
        rose: { 300: '#ffb3b8', 400: '#ff7a84', 500: '#ff4d5e', 600: '#e02c44' },
      },
      fontFamily: {
        display: ['Rajdhani', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-neon': '0 0 24px -4px rgba(34, 211, 255, 0.5)',
        'glow-volt': '0 0 28px -4px rgba(61, 128, 255, 0.55)',
        'glow-amber': '0 0 24px -4px rgba(245, 184, 46, 0.5)',
        'glow-rose': '0 0 24px -4px rgba(255, 77, 94, 0.5)',
        card: '0 16px 48px -20px rgba(0, 0, 0, 0.8)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        wobble: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 211, 255, 0.35)' },
          '50%': { boxShadow: '0 0 0 6px rgba(34, 211, 255, 0)' },
        },
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        wobble: 'wobble 2.4s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
