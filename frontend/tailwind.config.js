/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0A66C2',
        surface: '#F3F4F6',
        ink: '#1F2937',
        verified: '#16A34A',
        boost: '#F59E0B',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        soft: '0 2px 8px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}
