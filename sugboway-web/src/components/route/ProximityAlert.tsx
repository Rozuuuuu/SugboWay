import React from "react";

interface ProximityAlertProps {
  distanceToStop: number | null;
  nextStopName: string | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onDismiss: () => void;
}

export default function ProximityAlert({
  distanceToStop,
  nextStopName,
  isMuted,
  onToggleMute,
  onDismiss,
}: ProximityAlertProps) {
  if (!nextStopName) return null;

  // Estimate disembarkation time based on average jeepney speed (~15 km/h -> 4.1 m/s)
  const approxSeconds = distanceToStop ? Math.round(distanceToStop / 4.1) : 0;
  const approxTimeStr = approxSeconds > 60 
    ? `${Math.floor(approxSeconds / 60)}m ${approxSeconds % 60}s` 
    : `${approxSeconds}s`;

  // Calculate progress percentage (200m down to 0m)
  const progressPercent = distanceToStop 
    ? Math.min(100, Math.max(10, ((200 - distanceToStop) / 200) * 100))
    : 100;

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:w-96 z-40 animate-slide-up shadow-2xl">
      <div className="bg-surface-container-high border border-safe-green/40 shadow-xl rounded-2xl p-5 flex flex-col gap-4 theme-transition">
        <div className="flex items-start gap-4">
          {/* Attention icon with a single wave cue */}
          <div className="w-12 h-12 rounded-2xl bg-safe-green/15 flex items-center justify-center shrink-0 relative">
            <span className="material-symbols-outlined text-safe-green text-2xl">campaign</span>
            <span className="absolute inset-0 rounded-2xl border-2 border-safe-green/40 animate-ping opacity-75" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-safe-green">
                Your stop is coming up
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onToggleMute}
                  className="p-1.5 rounded-full hover:bg-on-surface/5 text-on-surface-variant transition-all active:scale-90 flex items-center justify-center"
                  title={isMuted ? "Unmute chime (metal tap sound)" : "Mute chime"}
                >
                  <span className="material-symbols-outlined text-base">
                    {isMuted ? "volume_off" : "volume_up"}
                  </span>
                </button>
                <button
                  onClick={onDismiss}
                  className="p-1.5 rounded-full hover:bg-on-surface/5 text-on-surface-variant transition-all active:scale-90 flex items-center justify-center"
                  title="Dismiss alert"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            </div>

            <h3 className="text-lg font-extrabold tracking-tight text-on-surface mt-1 truncate pr-2">
              Approaching {nextStopName}
            </h3>
            
            <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed font-semibold">
              Prepare your fare (<span className="italic text-cebu-blue">"Bayad po"</span> / <span className="italic text-cebu-blue">"Plete palihug"</span>). 
              Say <span className="italic text-safe-green">"Lugar lang"</span> to disembark!
            </p>
          </div>
        </div>

        {/* Distance + arrival */}
        <div className="bg-surface-container-highest border border-outline-variant/40 rounded-xl p-3 flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-on-surface-variant text-xs">Distance</span>
            <span className="text-base font-bold text-on-surface mt-0.5 tabular-nums flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-safe-green" />
              {distanceToStop !== null ? `${distanceToStop}m` : "Locating…"}
            </span>
          </div>
          <div className="h-7 w-px bg-outline-variant/40" />
          <div className="flex flex-col items-end">
            <span className="text-on-surface-variant text-xs">About</span>
            <span className="text-base font-bold text-safe-green mt-0.5 tabular-nums">
              ~{approxTimeStr}
            </span>
          </div>
        </div>

        {/* Proximity Progress Bar */}
        <div className="w-full bg-outline-variant/30 h-1.5 rounded-full overflow-hidden">
          <div 
            className="bg-safe-green h-full rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progressPercent}%` }} 
          />
        </div>
      </div>
    </div>
  );
}
