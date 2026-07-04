"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import GoogleButton from "@/components/auth/GoogleButton";
import BrandMark from "@/components/BrandMark";

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

  const inputClass =
    "mt-1 w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-sm text-on-surface transition-colors duration-150 focus:outline-none focus:border-cebu-blue focus:ring-2 focus:ring-cebu-blue/15";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 animate-[fadeIn_0.15s_ease-out]" onClick={onClose}>
      <div
        className="relative w-full max-w-sm bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 space-y-4 shadow-2xl animate-[scaleUp_0.25s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "check-email" ? (
          <div className="text-center space-y-3">
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 p-1.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-[20px] block">close</span>
            </button>
            <div className="sw-brand-tile w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-3xl">mark_email_unread</span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-on-surface">Check your email</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              We sent a verification link to <span className="font-semibold">{email}</span>. Open it, then sign in.
            </p>
            <button
              onClick={() => resend(email)}
              className="text-sm font-semibold text-cebu-blue hover:underline active:scale-95 transition-transform inline-block"
            >
              Resend email
            </button>
            <button
              onClick={() => setMode("login")}
              className="sw-btn-primary block w-full mt-2 font-semibold text-sm py-2.5 rounded-xl"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            {/* Branded header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="sw-brand-tile w-11 h-11 rounded-2xl flex items-center justify-center shrink-0">
                  <BrandMark className="w-6 h-7" mono />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold tracking-tight text-on-surface leading-tight">
                    {mode === "login" ? "Welcome back" : "Create your account"}
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {mode === "login"
                      ? "Sign in to your SugboWay account"
                      : "Free accounts get 10 questions an hour"}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 -mr-1.5 -mt-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 active:scale-90 transition-all shrink-0"
              >
                <span className="material-symbols-outlined text-[20px] block">close</span>
              </button>
            </div>

            {/* Form first */}
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
                    className={inputClass}
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
                  className={inputClass}
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
                  className={inputClass}
                  placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                />
              </label>

              {error && <p className="text-xs text-error font-medium animate-[fadeIn_0.15s_ease-out]">{error}</p>}

              <button
                onClick={submit}
                disabled={busy}
                className="sw-btn-primary w-full font-semibold text-sm py-2.5 rounded-xl disabled:active:scale-100"
              >
                {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </div>

            {/* Google below the form (divider lives inside the button component,
                so both disappear together when Google sign-in isn't configured) */}
            <GoogleButton onError={setError} onSuccess={onClose} />

            <p className="text-xs text-center text-on-surface-variant">
              {mode === "login" ? "New to SugboWay? " : "Already have an account? "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                }}
                className="font-semibold text-cebu-blue hover:underline active:scale-95 transition-transform inline-block"
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
