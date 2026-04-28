import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#102027',
        paper: '#f5f7f6',
        mist: '#e6ecea',
        teal: '#1f7a8c',
        mint: '#2d9a73',
        saffron: '#c47c21',
        coral: '#d45b4d'
      },
      boxShadow: {
        panel: '0 14px 38px rgb(16 32 39 / 0.08)'
      }
    }
  },
  plugins: []
} satisfies Config;
