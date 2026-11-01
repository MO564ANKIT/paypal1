import { useState, type FormEvent } from 'react';
import { Flame, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useAuth } from '@/state/authContext';

type Mode = 'signIn' | 'signUp';

const MODES: { id: Mode; label: string }[] = [
  { id: 'signIn', label: 'Sign in' },
  { id: 'signUp', label: 'Create account' },
];

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = mode === 'signIn' ? await signIn(trimmedEmail, password) : await signUp(trimmedEmail, password);
    if (result) setError(result);
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 text-ink-100">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-neon-400/50 bg-night-900 shadow-glow-neon">
            <Flame className="h-6 w-6 text-neon-300" strokeWidth={2.25} />
          </div>
          <div>
            <p className="font-display text-2xl font-bold uppercase tracking-[0.18em] text-ink-50">Spendemon</p>
            <p className="mt-2 text-sm text-ink-300">Sign in to keep your monsters, quests, and budget safe on every device.</p>
          </div>
        </div>

        <section className="card space-y-6 p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-night-950/70 p-1" role="tablist" aria-label="Account">
            {MODES.map((option) => {
              const active = option.id === mode;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchMode(option.id)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold transition duration-200',
                    active ? 'bg-volt-500/20 text-volt-100' : 'text-ink-300 hover:text-ink-100',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label htmlFor="auth-email" className="text-sm font-medium text-ink-200">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input w-full"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="auth-password" className="text-sm font-medium text-ink-200">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input w-full"
                disabled={submitting}
                aria-describedby={error ? 'auth-error' : undefined}
              />
            </div>

            {error && (
              <p id="auth-error" role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {mode === 'signIn' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {submitting ? 'Please wait...' : mode === 'signIn' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
