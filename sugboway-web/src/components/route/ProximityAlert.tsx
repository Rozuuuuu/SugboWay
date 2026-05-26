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
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-96 z-40 animate-slide-up shadow-2xl">
      <div className="bg-surface-container-high/90 backdrop-blur-xl border border-safe-green/40 shadow-2xl rounded-3xl p-5 flex flex-col gap-4 relative overflow-hidden">
        {/* Pulsing decorative background glow */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-safe-green/10 rounded-full blur-2xl -mr-8 -mt-8 animate-pulse" />

        <div className="flex items-start gap-4">
          {/* Animated icon representing jeepney coin-tapping */}
          <div className="w-12 h-12 rounded-full bg-safe-green/10 border border-safe-green/30 flex items-center justify-center shrink-0 animate-bounce relative">
            <span className="material-symbols-outlined text-safe-green text-2xl">campaign</span>
            {/* Wave animation */}
            <span className="absolute inset-0 rounded-full border-2 border-safe-green/30 animate-ping opacity-75" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-safe-green uppercase tracking-wider font-mono">
                Lugar Lang Prompt
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onToggleMute}
                  className="p-1.5 rounded-full hover:bg-on-surface/5 text-on-surface-variant transition-colors flex items-center justify-center"
                  title={isMuted ? "Unmute chime (metal tap sound)" : "Mute chime"}
                >
                  <span className="material-symbols-outlined text-base">
                    {isMuted ? "volume_off" : "volume_up"}
                  </span>
                </button>
                <button
                  onClick={onDismiss}
                  className="p-1.5 rounded-full hover:bg-on-surface/5 text-on-surface-variant transition-colors flex items-center justify-center"
                  title="Dismiss alert"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            </div>

            <h3 className="text-base font-bold text-on-surface mt-1 truncate pr-2">
              Approaching {nextStopName}
            </h3>
            
            <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
              Prepare your fare (<span className="italic font-semibold text-cebu-blue">"Plete palihug"</span>). 
              Say <span className="italic font-semibold text-safe-green">"Lugar lang"</span> clearly to disembark!
            </p>
          </div>
        </div>

        {/* Live GPS Proximity Telemetry */}
        <div className="bg-surface-container-highest/60 border border-outline-variant/20 rounded-2xl p-3 flex justify-between items-center text-xs">
          <div className="flex flex-col">
            <span className="text-on-surface-variant text-[9px] uppercase font-mono tracking-wider">
              Distance
            </span>
            <span className="text-sm font-bold text-on-surface mt-0.5 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-safe-green animate-pulse" />
              {distanceToStop !== null ? `${distanceToStop}m` : "Locating..."}
            </span>
          </div>
          <div className="h-6 w-px bg-outline-variant/30" />
          <div className="flex flex-col items-end">
            <span className="text-on-surface-variant text-[9px] uppercase font-mono tracking-wider">
              Est. Arrival
            </span>
            <span className="text-sm font-bold text-safe-green mt-0.5 font-mono">
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
