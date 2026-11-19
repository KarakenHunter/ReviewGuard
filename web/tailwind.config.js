/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      colors: {
        background: '#0A0F1F', card: '#111830', raised: '#182246', border: '#243058',
        foreground: '#E7EAF6', muted: '#8E97B8', faint: '#5E6890',
        primary: '#5B8CFF', violet: '#9B6BFF', success: '#3DDC97', warning: '#F5B544', danger: '#FF5C7A',
      },
      borderRadius: { xl: '0.9rem' },
    },
  },
  plugins: [],
};
