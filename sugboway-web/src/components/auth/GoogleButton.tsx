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

const GoogleButton = ({ onError }: { onError?: (msg: string) => void }) => {
  const { googleLogin } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => {
            void googleLogin(resp.credential).then((r) => {
              if (!r.ok && onError) onError("Google sign-in failed. Please try again.");
            });
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 320,
        });
      })
      .catch(() => {
        if (onError) onError("Couldn't load Google sign-in.");
      });
    return () => {
      cancelled = true;
    };
  }, [googleLogin, onError]);

  if (!CLIENT_ID) return null;
  return <div ref={ref} className="flex justify-center" />;
};

export default GoogleButton;
