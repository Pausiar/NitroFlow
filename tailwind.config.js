/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        fluent: {
          bg: '#1c1c1e',
          surface: '#2c2c2e',
          card: '#3a3a3c',
          border: '#48484a',
          accent: '#0078d4',
          accentHover: '#1084d8',
          text: '#ffffff',
          textMuted: '#aeaeb2',
          success: '#30d158',
          warning: '#ffd60a',
          error: '#ff453a',
          info: '#64d2ff'
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        fluent: '8px',
        fluentLg: '12px'
      },
      boxShadow: {
        fluent: '0 2px 8px rgba(0,0,0,0.4)',
        fluentLg: '0 4px 20px rgba(0,0,0,0.5)'
      }
    }
  },
  plugins: []
}
