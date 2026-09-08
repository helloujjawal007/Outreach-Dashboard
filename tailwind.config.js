/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          900: '#0f172a',
          700: '#1e293b',
          500: '#475569',
          300: '#94a3b8',
          100: '#e2e8f0',
          50: '#f8fafc',
        },
        brand: {
          50: '#eef6ff',
          100: '#d9edff',
          200: '#bce0ff',
          300: '#8ecdff',
          400: '#59b0ff',
          500: '#3393ff',
          600: '#1f73eb',
          700: '#1a5dbf',
          800: '#1b4f99',
          900: '#1c457d',
        },
        accent: {
          500: '#0d9488',
          600: '#0c8077',
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in': 'slide-in 0.25s ease-out',
        'pulse-ring': 'pulse-ring 1.5s ease-out infinite',
      },
    },
  },
  plugins: [],
};
