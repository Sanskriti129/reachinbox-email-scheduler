import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'outline' | 'soft' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  outline: 'border border-brand-600 text-brand-600 bg-white hover:bg-brand-50 disabled:opacity-50',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50',
  ghost: 'text-muted hover:bg-surface hover:text-ink disabled:opacity-50',
  danger: 'border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-4 text-xs',
  md: 'h-10 px-5 text-sm',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  rounded?: 'full' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  rounded = 'full',
  className = '',
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed ${
        rounded === 'full' ? 'rounded-full' : 'rounded-lg'
      } ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={`inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
