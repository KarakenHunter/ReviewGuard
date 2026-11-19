import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { describeError } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input, Label } from '../components/ui/form';
import { ErrorState } from '../components/ui/misc';
import { cn } from '../lib/utils';

export default function Login() {
  const { user, login, register } = useAuth();
  const nav = useNavigate(); const loc = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  if (user) return <Navigate to={loc.state?.from || '/'} replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (mode === 'login') await login({ email: form.email, password: form.password });
      else await register(form);
      nav(loc.state?.from || '/', { replace: true });
    } catch (err) {
      const d = describeError(err);
      setError(d.status === 400 && d.details?.length ? { message: d.details.map((x) => `${x.field.replace('body.', '')}: ${x.message}`).join('. ') } : d);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3"><img src="/favicon.svg" alt="" className="h-10 w-10" /><div><h1 className="text-2xl font-semibold tracking-tight">ReviewGuard</h1><p className="text-sm text-muted">Find emotionally charged reviews and decide what to do with them.</p></div></div>
        <Card>
          <CardContent className="pt-5">
            <div className="mb-5 grid grid-cols-2 rounded-lg bg-background p-1 text-sm" role="tablist">
              {[['login', 'Sign in'], ['register', 'Create account']].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setError(null); }}
                  className={cn('rounded-md py-2 font-medium transition-colors', mode === k ? 'bg-raised text-foreground' : 'text-muted hover:text-foreground')}>{l}</button>
              ))}
            </div>
            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && <div><Label htmlFor="name">Name</Label><Input id="name" autoComplete="name" required maxLength={100} value={form.name} onChange={set('name')} /></div>}
              <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></div>
              <div><Label htmlFor="password">Password</Label><Input id="password" type="password" required minLength={mode === 'register' ? 10 : 1} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} />
                {mode === 'register' && <p className="mt-1 text-xs text-muted">At least 10 characters.</p>}</div>
              <ErrorState error={error} />
              <Button type="submit" className="w-full" loading={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
