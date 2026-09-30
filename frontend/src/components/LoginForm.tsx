"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, Layers, LoaderCircle, LockKeyhole, LogIn, User } from "lucide-react";
import { apiLogin } from "@/lib/api";

type LoginFormProps = {
  onSuccess: () => void;
};

export const LoginForm = ({ onSuccess }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await apiLogin(username.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] items-center justify-center px-6 py-12">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-3xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)] md:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[var(--navy-dark)] p-8 text-white md:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[rgba(32,157,215,0.35)] blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[rgba(117,57,145,0.5)] blur-2xl"
          />
          <div className="relative flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-yellow)] text-[var(--navy-dark)]">
              <Layers size={18} />
            </span>
            <span className="font-display text-lg font-semibold">Kanban Studio</span>
          </div>
          <div className="relative">
            <div className="h-1 w-12 rounded-full bg-[var(--accent-yellow)]" />
            <p className="mt-4 font-display text-2xl font-semibold leading-snug">
              One board.
              <br />
              Five columns.
              <br />
              Zero clutter.
            </p>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Drag cards between stages, rename columns, and let the AI assistant keep momentum visible.
            </p>
          </div>
          <p className="relative text-xs uppercase tracking-[0.25em] text-white/50">
            Single Board Kanban
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col justify-center p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)] md:hidden">
            Single Board Kanban
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-[var(--navy-dark)] md:mt-0">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-[var(--gray-text)]">
            Sign in with user / password.
          </p>
          <div className="mt-6 space-y-3">
            <label className="flex items-center gap-2.5 rounded-xl border border-[var(--stroke)] bg-[#f6f8fb] px-3 transition focus-within:border-[var(--primary-blue)] focus-within:bg-white focus-within:ring-2 focus-within:ring-[var(--ring)]">
              <User size={16} className="shrink-0 text-[var(--gray-text)]" />
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
                autoComplete="username"
                aria-label="Username"
                className="w-full bg-transparent py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none placeholder:text-[var(--gray-text)]"
                required
              />
            </label>
            <label className="flex items-center gap-2.5 rounded-xl border border-[var(--stroke)] bg-[#f6f8fb] px-3 transition focus-within:border-[var(--primary-blue)] focus-within:bg-white focus-within:ring-2 focus-within:ring-[var(--ring)]">
              <LockKeyhole size={16} className="shrink-0 text-[var(--gray-text)]" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                autoComplete="current-password"
                aria-label="Password"
                className="w-full bg-transparent py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none placeholder:text-[var(--gray-text)]"
                required
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="mt-3 flex items-center gap-2 rounded-xl bg-[rgba(220,38,38,0.06)] px-3 py-2 text-sm font-medium text-red-600">
              <CircleAlert size={15} className="shrink-0" />
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--secondary-purple)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {pending ? (
              <>
                <LoaderCircle size={15} className="spinner" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn size={15} />
                Sign in
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
