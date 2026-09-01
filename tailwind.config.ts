import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: { panel: '0 20px 60px -28px rgb(24 24 27 / 0.24)' },
    },
  },
  plugins: [],
} satisfies Config
