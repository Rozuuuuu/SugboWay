"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleCredentialResponse {
  credential: string;
}
interface GoogleIdApi {
  initialize: (config: { client_id: string; callback: (r: GoogleCredentialResponse) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const loadScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script error")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script error"));
    document.head.appendChild(s);
  });

interface GoogleButtonProps {
  onError?: (msg: string) => void;
  onSuccess?: () => void;
}

const GoogleButton = ({ onError, onSuccess }: GoogleButtonProps) => {
  const { googleLogin } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  // The parent may pass unstable inline callbacks (e.g. onClose from page state).
  // Keep them in a ref so the GIS effect below doesn't re-fire per parent render
  // (re-running renderButton stacks duplicate buttons into the same div).
  const callbacksRef = useRef<GoogleButtonProps>({ onError, onSuccess });
  useEffect(() => {
    callbacksRef.current = { onError, onSuccess };
  });

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => {
            void googleLogin(resp.credential)
              .then((r) => {
                if (r.ok) callbacksRef.current.onSuccess?.();
                else callbacksRef.current.onError?.("Google sign-in failed. Please try again.");
              })
              .catch(() => {
                callbacksRef.current.onError?.("Google sign-in failed. Please try again.");
              });
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "left",
          width: 336,
        });
      })
      .catch(() => {
        callbacksRef.current.onError?.("Couldn't load Google sign-in.");
      });
    return () => {
      cancelled = true;
    };
  }, [googleLogin]);

  if (!CLIENT_ID) return null;
  return (
    <div className="space-y-4">
      {/* Divider lives here so it disappears with the button when Google is off. */}
      <div className="flex items-center gap-3 text-xs text-on-surface-variant">
        <span className="h-px flex-1 bg-outline-variant" />
        or continue with
        <span className="h-px flex-1 bg-outline-variant" />
      </div>
      <div ref={ref} className="flex justify-center min-h-[44px]" />
    </div>
  );
};

export default GoogleButton;
