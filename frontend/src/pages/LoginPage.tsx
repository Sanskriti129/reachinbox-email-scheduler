import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const errorText: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Your sign-in session expired. Please try again.',
};

export function LoginPage() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);
  const error = params.get('error');

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (user) return <Navigate to="/scheduled" replace />;

  // The Figma shows an email/password form; this app authenticates with Google only.
  const onEmailLogin = (e: FormEvent) => {
    e.preventDefault();
    toast('Email login is not enabled for this demo — please continue with Google.', 'info');
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line px-8 py-10 shadow-[0_1px_20px_rgba(0,0,0,0.04)]">
        <h1 className="mb-6 text-center text-2xl font-semibold">Login</h1>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
            {errorText[error] ?? 'Sign-in failed. Please try again.'}
          </p>
        )}

        <a
          href={api.googleLoginUrl}
          onClick={() => setRedirecting(true)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-50 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100"
        >
          {redirecting ? <Spinner className="size-4" /> : <GoogleIcon />}
          Login with Google
        </a>

        <div className="my-6 flex items-center gap-3 text-xs text-faint">
          <span className="h-px flex-1 bg-line" />
          or sign up through email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={onEmailLogin} className="space-y-3">
          <input
            type="email"
            placeholder="Email ID"
            aria-label="Email ID"
            className="h-11 w-full rounded-lg bg-surface px-4 text-sm outline-none focus:ring-2 focus:ring-brand-100"
          />
          <input
            type="password"
            placeholder="Password"
            aria-label="Password"
            className="h-11 w-full rounded-lg bg-surface px-4 text-sm outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            className="h-11 w-full rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
