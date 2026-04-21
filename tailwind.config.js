module.exports = {
  content: ['./src/**/*.{jsx,js,ts,tsx}', './index.html'],
  theme: {
    extend: {
      /* Radix / shadcn primitives — must map to tokens or bg-popover etc. produce no CSS */
      colors: {
        border: 'var(--color-border-medium)',
        input: 'var(--color-input-border)',
        ring: 'rgba(10, 10, 10, 0.28)',
        background: 'var(--color-bg-base)',
        foreground: 'var(--color-text-primary)',
        primary: {
          DEFAULT: 'var(--color-btn-primary-bg)',
          foreground: 'var(--color-btn-primary-text)',
        },
        secondary: {
          DEFAULT: 'var(--color-bg-surface)',
          foreground: 'var(--color-text-primary)',
        },
        muted: {
          DEFAULT: 'var(--color-bg-elevated)',
          foreground: 'var(--color-text-tertiary)',
        },
        accent: {
          DEFAULT: 'var(--color-bg-elevated)',
          foreground: 'var(--color-text-primary)',
        },
        popover: {
          DEFAULT: 'var(--color-bg-base)',
          foreground: 'var(--color-text-primary)',
        },
        card: {
          DEFAULT: 'var(--color-bg-base)',
          foreground: 'var(--color-text-primary)',
        },
        destructive: {
          DEFAULT: 'var(--color-status-error-dot)',
          foreground: 'var(--color-text-inverse)',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
