"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

type Mode = "login" | "register" | "check-email";

interface Props {
  open: boolean;
  onClose: () => void;
  initialMode?: "login" | "register";
}

const AuthModal = ({ open, onClose, initialMode = "login" }: Props) => {
  const { login, register, resend } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setPassword("");
    }
  }, [open, initialMode]);

  if (!open) return null;

  const friendly: Record<string, string> = {
    invalid_credentials: "Email or password is incorrect.",
    email_taken: "That email is already registered. Try signing in.",
    weak_password: "Use at least 8 characters.",
    invalid_email: "Enter a valid email address.",
    email_not_verified: "Please verify your email first.",
    missing_name: "Please enter your name.",
  };

  const submit = async () => {
    if (mode === "register" && name.trim() === "") {
      setError(friendly.missing_name);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        const r = await register(name.trim(), email, password);
        if (r.ok) setMode("check-email");
        else setError(friendly[r.error ?? ""] ?? "Something went wrong. Try again.");
      } else {
        const r = await login(email, password);
        if (r.ok) onClose();
        else if (r.needsVerification) setMode("check-email");
        else setError(friendly[r.error ?? ""] ?? "Something went wrong. Try again.");
      }
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 space-y-4 animate-[fadeIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "check-email" ? (
          <div className="text-center space-y-3">
            <span className="material-symbols-outlined text-cebu-blue text-4xl">mark_email_unread</span>
            <h2 className="text-lg font-bold text-on-surface">Check your email</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              We sent a verification link to <span className="font-semibold">{email}</span>. Open it, then sign in.
            </p>
            <button
              onClick={() => resend(email)}
              className="text-sm font-semibold text-cebu-blue hover:underline"
            >
              Resend email
            </button>
            <button
              onClick={() => setMode("login")}
              className="block w-full mt-2 bg-cebu-blue text-white font-semibold text-sm py-2.5 rounded-xl active:scale-95 transition-transform"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-on-surface">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <button onClick={onClose} aria-label="Close" className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3">
              {mode === "register" && (
                <label className="block">
                  <span className="text-xs font-semibold text-on-surface-variant">Full name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={!!error}
                    autoComplete="name"
                    className="mt-1 w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-cebu-blue"
                    placeholder="Juan dela Cruz"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-semibold text-on-surface-variant">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error}
                  className="mt-1 w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-cebu-blue"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-on-surface-variant">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  aria-invalid={!!error}
                  className="mt-1 w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-cebu-blue"
                  placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                />
              </label>

              {error && <p className="text-xs text-error font-medium">{error}</p>}

              <button
                onClick={submit}
                disabled={busy}
                className="w-full bg-cebu-blue text-white font-semibold text-sm py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-60"
              >
                {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </div>

            <p className="text-xs text-center text-on-surface-variant">
              {mode === "login" ? "New to SugboWay? " : "Already have an account? "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                }}
                className="font-semibold text-cebu-blue hover:underline"
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
