import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
const badge = cva('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'border-border bg-raised text-muted',
      blue: 'border-primary/30 bg-primary/10 text-primary',
      violet: 'border-violet/30 bg-violet/10 text-violet',
      success: 'border-success/30 bg-success/10 text-success',
      warning: 'border-warning/30 bg-warning/10 text-warning',
      danger: 'border-danger/30 bg-danger/10 text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export const Badge = ({ className, tone, ...p }) => <span className={cn(badge({ tone }), className)} {...p} />;
