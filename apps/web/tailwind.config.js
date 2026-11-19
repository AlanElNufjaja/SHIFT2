/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: '#E8DFCE',
        cream: '#FAF6EE',
        bark: '#C8B89E',
        harvest: '#D99B26',
        ochre: '#C87D18',
        terracotta: '#A84A28',
        forest: {
          50: '#EDF5EF',
          100: '#D8EAD9',
          200: '#B5D6BA',
          600: '#2D6345',
          700: '#234E36',
          800: '#1B3B2B',
          900: '#132B1F',
        },
      },
      boxShadow: {
        card: '0 2px 6px -1px rgba(58, 42, 24, 0.10), 0 1px 3px 0 rgba(58, 42, 24, 0.06)',
        elevated: '0 12px 28px -6px rgba(42, 33, 24, 0.16), 0 4px 10px -2px rgba(42, 33, 24, 0.08)',
      },
    },
  },
  plugins: [],
};
