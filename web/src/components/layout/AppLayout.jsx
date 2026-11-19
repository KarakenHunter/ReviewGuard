import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, FileText, LayoutDashboard, LogOut, Menu, ScanSearch, ShieldCheck, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/analyze', label: 'Review analyzer', icon: ScanSearch },
  { to: '/bulk', label: 'Bulk analysis', icon: Upload },
  { to: '/moderation', label: 'Moderation', icon: ShieldCheck },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileText },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg font-semibold tracking-tight">ReviewGuard</span>
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Brand />
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            isActive ? 'bg-primary/15 text-primary' : 'text-muted hover:bg-raised hover:text-foreground')}>
            <Icon className="h-[18px] w-[18px]" aria-hidden />{label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border pt-4">
        <p className="truncate px-2 text-sm font-medium">{user?.name}</p>
        <p className="truncate px-2 pb-2 text-xs text-muted">{user?.email}</p>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}><LogOut className="h-4 w-4" aria-hidden />Sign out</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-border bg-card lg:block">{sidebar}</aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></Button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-card">
            <Button variant="ghost" size="icon" className="absolute right-2 top-3" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
            {sidebar}
          </div>
        </div>
      )}
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8"><div className="mx-auto max-w-6xl"><Outlet /></div></main>
    </div>
  );
}
