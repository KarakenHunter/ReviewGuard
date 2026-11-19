import { cn } from '../../lib/utils';
export const Table = ({ className, ...p }) => <div className="w-full overflow-x-auto"><table className={cn('w-full border-collapse text-sm', className)} {...p} /></div>;
export const Th = ({ className, ...p }) => <th className={cn('whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-xs font-medium text-muted', className)} {...p} />;
export const Td = ({ className, ...p }) => <td className={cn('border-b border-border/60 px-3 py-2.5 align-top', className)} {...p} />;
