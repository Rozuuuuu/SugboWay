"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

interface Plan {
  id: "guest" | "free" | "pro" | "max";
  name: string;
  price: string;
  quota: string;
  perks: string[];
  upgradeTo?: "pro" | "max";
}

const PLANS: Plan[] = [
  { id: "guest", name: "Guest", price: "—", quota: "5 questions / hour", perks: ["Browse routes, fares & traffic", "No account needed"] },
  { id: "free", name: "Free", price: "₱0", quota: "10 questions / hour", perks: ["Everything in Guest", "Saved across sessions"] },
  { id: "pro", name: "Pro", price: "₱149/mo", quota: "100 questions / hour", perks: ["Everything in Free", "Offline maps"], upgradeTo: "pro" },
  { id: "max", name: "Max", price: "₱349/mo", quota: "Unlimited questions", perks: ["Everything in Pro", "Priority routing", "Early crowding alerts"], upgradeTo: "max" },
];

const PricingPlans = ({ onRequireAuth }: { onRequireAuth: () => void }) => {
  const { user, isAuthed, upgrade } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const currentTier = isAuthed ? user?.tier : "guest";

  const handleUpgrade = async (plan: Plan) => {
    if (!plan.upgradeTo) return;
    if (!isAuthed) {
      onRequireAuth();
      return;
    }
    setBusy(plan.id);
    try {
      await upgrade(plan.upgradeTo);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {PLANS.map((plan) => {
        const isCurrent = plan.id === currentTier;
        const accent = plan.id === "pro" || plan.id === "max";
        const isFeatured = plan.id === "max";
        return (
          <div
            key={plan.id}
            className={`relative rounded-2xl p-4 flex flex-col gap-3 transition-all ${
              isFeatured
                ? "sw-card-featured"
                : isCurrent
                ? "border-2 border-cebu-blue bg-cebu-blue/5 shadow-[var(--sw-shadow-card)]"
                : "border border-outline-variant bg-surface-container-lowest shadow-[var(--sw-shadow-card)]"
            }`}
          >
            {isFeatured && (
              <span className="sw-btn-clay absolute -top-2.5 right-4 text-[9px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full">
                Best value
              </span>
            )}
            <div className="flex items-baseline justify-between">
              <h4 className="text-base font-extrabold tracking-tight text-on-surface">{plan.name}</h4>
              <span className={`text-sm font-extrabold ${accent ? "text-clay" : "text-on-surface-variant"}`}>{plan.price}</span>
            </div>
            <p className="text-sm font-bold text-on-surface">{plan.quota}</p>
            <ul className="space-y-1.5 flex-1">
              {plan.perks.map((perk) => (
                <li key={perk} className="flex items-start gap-1.5 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-safe-green text-sm leading-tight">check_circle</span>
                  {perk}
                </li>
              ))}
            </ul>
            {isCurrent ? (
              <span className="text-center text-xs font-extrabold text-cebu-blue py-2 rounded-xl sw-nav-active">
                Current plan
              </span>
            ) : plan.upgradeTo ? (
              <button
                onClick={() => handleUpgrade(plan)}
                disabled={busy === plan.id}
                className="sw-btn-clay text-sm font-bold py-2.5 rounded-xl disabled:opacity-60"
              >
                {busy === plan.id ? "Upgrading…" : isAuthed ? `Upgrade to ${plan.name}` : "Sign in to upgrade"}
              </button>
            ) : (
              <span className="h-[36px]" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PricingPlans;
