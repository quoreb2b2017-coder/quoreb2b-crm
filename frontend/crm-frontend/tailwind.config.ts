import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        quore: {
          50: '#ecfdf7',
          100: '#d1faee',
          200: '#a7f3dc',
          300: '#6ee7bf',
          400: '#34d399',
          500: '#00d19e',
          600: '#00b386',
          700: '#009972',
          800: '#047857',
          900: '#065f46',
        },
        crm: {
          sidebar: '#f0f4f8',
          primary: '#2e7ad1',
          'primary-dark': '#2568b8',
          'primary-light': '#e8f1fb',
        },
      },
      boxShadow: {
        quore: '0 8px 28px rgba(0, 209, 158, 0.22)',
        crm: '0 4px 20px rgba(46, 122, 209, 0.12)',
        'crm-lg': '0 8px 32px rgba(46, 122, 209, 0.14)',
        soft: '0 1px 3px rgba(15, 23, 42, 0.05), 0 4px 16px rgba(15, 23, 42, 0.04)',
        'soft-lg': '0 4px 12px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 23, 42, 0.08)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
        snap: 'cubic-bezier(0.34, 1.2, 0.64, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '220ms',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  
  plugins: [],
};

export default config;
