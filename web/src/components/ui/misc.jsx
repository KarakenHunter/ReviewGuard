import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

export const Spinner = ({ className }) => <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-label="Loading" />;
export const Skeleton = ({ className }) => <div className={cn('animate-pulse rounded-lg bg-raised/70', className)} />;

export function Progress({ value, className, label }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-raised', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${v}%` }} />
    </div>
  );
}

export function ErrorState({ error, onRetry, className }) {
  if (!error) return null;
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm', className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <div className="flex-1 text-foreground">{error.message || String(error)}</div>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Retry</Button>}
    </div>
  );
}

export function Notice({ tone = 'blue', children, className }) {
  const t = { blue: 'border-primary/30 bg-primary/10', warning: 'border-warning/30 bg-warning/10', success: 'border-success/30 bg-success/10', danger: 'border-danger/30 bg-danger/10' }[tone];
  return <div role="status" className={cn('rounded-xl border p-4 text-sm text-foreground', t, className)}>{children}</div>;
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Inbox className="h-8 w-8 text-faint" aria-hidden />
      <p className="font-medium text-foreground">{title}</p>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export const PageHeader = ({ title, description, actions }) => (
  <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
    </div>
    {actions}
  </div>
);
