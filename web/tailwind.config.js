/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      colors: {
        background: '#F5F6F8', card: '#FFFFFF', raised: '#F1F3F6', border: '#E4E7EC',
        foreground: '#20232A', muted: '#667085', faint: '#98A2B3',
        primary: '#4563C7', violet: '#7558B5', success: '#247A55', warning: '#A76716', danger: '#C7464F',
        sidebar: '#17181C', 'sidebar-foreground': '#F5F5F6', 'sidebar-muted': '#A3A5AA',
        'sidebar-raised': '#2A2B30', 'sidebar-border': '#34353A',
      },
      borderRadius: { xl: '0.9rem' },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 2px 6px rgba(16, 24, 40, 0.035)',
        panel: '0 12px 32px rgba(16, 24, 40, 0.16)',
      },
    },
  },
  plugins: [],
};
