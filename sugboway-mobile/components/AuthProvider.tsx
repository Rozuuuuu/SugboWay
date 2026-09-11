import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { authApi, type AuthUser } from "../lib/authApi";

const TOKEN_KEY = "sugboway-auth-token";
const USER_KEY = "sugboway-auth-user";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthed: boolean;
  // True until the SecureStore restore on mount has finished (success or not).
  // SecureStore is async (unlike web's synchronous localStorage), so there is a
  // startup window where a previously-signed-in user's session hasn't loaded
  // yet. Consumers that would otherwise flash a signed-out state (e.g. a
  // "Sign in" button) should gate on this instead of rendering immediately.
  isRestoring: boolean;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; emailSent?: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ ok: boolean; needsVerification?: boolean; error?: string }>;
  googleLogin: (credential: string) => Promise<{ ok: boolean; error?: string }>;
  resend: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  upgrade: (plan: "pro" | "max") => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isAuthed: false,
  isRestoring: true,
  register: async () => ({ ok: false }),
  login: async () => ({ ok: false }),
  googleLogin: async () => ({ ok: false }),
  resend: async () => {},
  logout: async () => {},
  upgrade: async () => ({ ok: false }),
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Restore session on mount. SecureStore is async, so — unlike the web
  // version's synchronous localStorage read — this can't finish before the
  // first render. isRestoring stays true until it settles either way.
  useEffect(() => {
    (async () => {
      try {
        const t = await SecureStore.getItemAsync(TOKEN_KEY);
        const u = await SecureStore.getItemAsync(USER_KEY);
        if (t && u) {
          setToken(t);
          setUser(JSON.parse(u) as AuthUser);
        }
      } catch {
        // ignore corrupt storage
      } finally {
        setIsRestoring(false);
      }
    })();
  }, []);

  const persist = useCallback(async (t: string, u: AuthUser) => {
    setToken(t);
    setUser(u);
    await SecureStore.setItemAsync(TOKEN_KEY, t);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await authApi.register(name, email, password);
    return { ok: r.ok, emailSent: r.emailSent, error: r.error };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await authApi.login(email, password);
    if (r.ok && r.token && r.user) await persist(r.token, r.user);
    return { ok: r.ok, needsVerification: r.needsVerification, error: r.error };
  }, [persist]);

  const googleLogin = useCallback(async (credential: string) => {
    const r = await authApi.googleLogin(credential);
    if (r.ok && r.token && r.user) await persist(r.token, r.user);
    return { ok: r.ok, error: r.error };
  }, [persist]);

  const resend = useCallback(async (email: string) => {
    await authApi.resend(email);
  }, []);

  // Unlike the web version's synchronous logout (localStorage.removeItem is
  // sync), this returns a Promise because SecureStore is async. In-memory
  // state is cleared FIRST and unconditionally, so the UI is correct even if
  // the deletes below fail or the process dies before they land — but a
  // process death between clearing memory and the deletes landing leaves the
  // token on disk, and the next launch's restore would sign the user back in.
  // Callers (e.g. a Profile screen) should `await logout()` before navigating
  // away, to close that window as tightly as possible.
  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY),
        SecureStore.deleteItemAsync(USER_KEY),
      ]);
    } catch {
      // Storage delete failed; in-memory state is already cleared so the UI
      // is correct for this session. The residual risk: a stale token left on
      // disk (delete failure, or the process dying before the deletes land)
      // will be picked back up by the next launch's restore, silently
      // re-authenticating the user. Swallowing here (rather than rejecting)
      // keeps logout() resolving so callers can still navigate away.
    }
  }, []);

  const upgrade = useCallback(async (plan: "pro" | "max") => {
    if (!token) return { ok: false, error: "not_authenticated" };
    const r = await authApi.upgrade(plan, token);
    if (r.ok && r.token && r.user) await persist(r.token, r.user);
    return { ok: r.ok, error: r.error };
  }, [token, persist]);

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthed: !!token, isRestoring, register, login, googleLogin, resend, logout, upgrade }}
    >
      {children}
    </AuthContext.Provider>
  );
}
