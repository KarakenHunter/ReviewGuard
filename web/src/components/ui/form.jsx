import { forwardRef } from 'react';
import { cn } from '../../lib/utils';
const field = 'w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-faint disabled:opacity-50';
export const Label = ({ className, ...p }) => <label className={cn('mb-1.5 block text-sm font-medium text-foreground', className)} {...p} />;
export const Input = forwardRef(({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-10', className)} {...p} />);
export const Textarea = forwardRef(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-[120px] py-2.5 leading-relaxed', className)} {...p} />);
export const Select = forwardRef(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, 'h-10 pr-8 [&>option]:bg-card', className)} {...p}>{children}</select>
));
