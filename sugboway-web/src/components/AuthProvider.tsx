"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi, type AuthUser } from "@/lib/authApi";

const TOKEN_KEY = "sugboway-auth-token";
const USER_KEY = "sugboway-auth-user";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthed: boolean;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; emailSent?: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ ok: boolean; needsVerification?: boolean; error?: string }>;
  googleLogin: (credential: string) => Promise<{ ok: boolean; error?: string }>;
  resend: (email: string) => Promise<void>;
  logout: () => void;
  upgrade: (plan: "pro" | "max") => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isAuthed: false,
  register: async () => ({ ok: false }),
  login: async () => ({ ok: false }),
  googleLogin: async () => ({ ok: false }),
  resend: async () => {},
  logout: () => {},
  upgrade: async () => ({ ok: false }),
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Restore session on mount.
  useEffect(() => {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const u = localStorage.getItem(USER_KEY);
      if (t && u) {
        setToken(t);
        setUser(JSON.parse(u) as AuthUser);
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  const persist = useCallback((t: string, u: AuthUser) => {
    setToken(t);
    setUser(u);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await authApi.register(name, email, password);
    return { ok: r.ok, emailSent: r.emailSent, error: r.error };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await authApi.login(email, password);
    if (r.ok && r.token && r.user) persist(r.token, r.user);
    return { ok: r.ok, needsVerification: r.needsVerification, error: r.error };
  }, [persist]);

  const googleLogin = useCallback(async (credential: string) => {
    const r = await authApi.googleLogin(credential);
    if (r.ok && r.token && r.user) persist(r.token, r.user);
    return { ok: r.ok, error: r.error };
  }, [persist]);

  const resend = useCallback(async (email: string) => {
    await authApi.resend(email);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const upgrade = useCallback(async (plan: "pro" | "max") => {
    if (!token) return { ok: false, error: "not_authenticated" };
    const r = await authApi.upgrade(plan, token);
    if (r.ok && r.token && r.user) persist(r.token, r.user);
    return { ok: r.ok, error: r.error };
  }, [token, persist]);

  return (
    <AuthContext.Provider value={{ user, token, isAuthed: !!token, register, login, googleLogin, resend, logout, upgrade }}>
      {children}
    </AuthContext.Provider>
  );
}
