import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const variants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white shadow-sm hover:bg-primary/90',
        secondary: 'border border-border bg-raised text-foreground hover:bg-raised/60',
        ghost: 'text-muted hover:bg-raised hover:text-foreground',
        success: 'border border-success/30 bg-success/10 text-success hover:bg-success/20',
        warning: 'border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20',
        danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
        violet: 'border border-violet/30 bg-violet/10 text-violet hover:bg-violet/20',
      },
      size: { sm: 'h-8 px-3', md: 'h-10 px-4', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export const Button = forwardRef(function Button({ className, variant, size, loading, disabled, children, ...props }, ref) {
  return (
    <button ref={ref} disabled={disabled || loading} className={cn(variants({ variant, size }), className)} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
