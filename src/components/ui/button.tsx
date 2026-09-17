import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'lg' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-live text-white hover:bg-live/90 disabled:bg-outside',
  secondary: 'bg-surface text-foreground border border-border hover:bg-outside-surface',
  ghost: 'text-muted hover:text-foreground hover:bg-outside-surface',
  danger: 'bg-surface text-blocking border border-blocking/30 hover:bg-blocking-surface',
};

// The assistant is working the stream while clicking this, so the touch target
// stays large even on desktop (docs/06 §3.1).
const SIZES: Record<Size, string> = {
  lg: 'h-12 px-6 text-base',
  md: 'h-10 px-4 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
