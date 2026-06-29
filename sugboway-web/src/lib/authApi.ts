const BASE = process.env.NEXT_PUBLIC_ROUTING_API_URL ?? "http://localhost:8080";

export type Tier = "free" | "pro" | "max";
export interface AuthUser {
  name: string;
  email: string;
  tier: Tier;
}

interface LoginResult {
  ok: boolean;
  token?: string;
  user?: AuthUser;
  needsVerification?: boolean;
  error?: string;
}
interface RegisterResult {
  ok: boolean;
  emailSent?: boolean;
  error?: string;
}

// Abort a request that takes too long so the UI fails fast with a clear error
// instead of hanging (e.g. a cold backend or a blocked/slow network).
const REQUEST_TIMEOUT_MS = 30000;

async function post(path: string, body: unknown, token?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/v1/auth${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export const authApi = {
  async register(name: string, email: string, password: string): Promise<RegisterResult> {
    const { status, data } = await post("/register", { name, email, password });
    if (status === 202) return { ok: true, emailSent: data.email_sent !== false };
    return { ok: false, error: data.error ?? "register_failed" };
  },

  async login(email: string, password: string): Promise<LoginResult> {
    const { status, data } = await post("/login", { email, password });
    if (status === 200) return { ok: true, token: data.token, user: data.user };
    if (status === 403 && data.error === "email_not_verified")
      return { ok: false, needsVerification: true, error: data.error };
    return { ok: false, error: data.error ?? "login_failed" };
  },

  async resend(email: string): Promise<void> {
    await post("/resend", { email });
  },

  async upgrade(plan: "pro" | "max", token: string): Promise<LoginResult> {
    const { status, data } = await post("/upgrade", { plan }, token);
    if (status === 200) return { ok: true, token: data.token, user: data.user };
    return { ok: false, error: data.error ?? "upgrade_failed" };
  },
};
