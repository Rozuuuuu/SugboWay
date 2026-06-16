import React from "react";

interface PeakWarningProps {
  peakLabel: string;
  cebuHour: number;
  weatherCondition: "clear" | "cloudy" | "rain" | "heavy_rain" | "unknown";
  weatherDescription: string;
  temperature: number | null;
  betaAdjustment: number;
  onDismiss: () => void;
}

export default function PeakWarning({
  peakLabel,
  cebuHour,
  weatherCondition,
  weatherDescription,
  temperature,
  betaAdjustment,
  onDismiss,
}: PeakWarningProps) {
  const getWeatherIcon = (cond: typeof weatherCondition) => {
    switch (cond) {
      case "heavy_rain":
        return "thunderstorm";
      case "rain":
        return "rainy";
      case "cloudy":
        return "cloud";
      case "clear":
        return "sunny";
      default:
        return "device_thermostat";
    }
  };

  const getWeatherColorClass = (cond: typeof weatherCondition) => {
    switch (cond) {
      case "heavy_rain":
        return "text-red-500 bg-red-500/10 border-red-500/30";
      case "rain":
        return "text-amber-500 bg-amber-500/10 border-amber-500/30";
      case "cloudy":
        return "text-blue-400 bg-blue-400/10 border-blue-400/30";
      case "clear":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/30";
      default:
        return "text-gray-400 bg-gray-400/10 border-gray-400/30";
    }
  };

  return (
    <div className="bg-surface-container-high/90 backdrop-blur-xl border border-red-500/20 shadow-xl rounded-3xl p-5 flex flex-col gap-4 relative overflow-hidden theme-transition animate-fade-in">
      <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl -mr-8 -mt-8" />
      
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0 relative">
          <span className="material-symbols-outlined text-red-500 text-2xl animate-pulse">warning</span>
          <span className="absolute inset-0 rounded-full border-2 border-red-500/20 animate-ping opacity-50" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider font-mono">
              Peak Traffic Warning ({peakLabel})
            </span>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-full hover:bg-on-surface/5 text-on-surface-variant transition-colors flex items-center justify-center"
              title="Dismiss warning"
              aria-label="Dismiss peak traffic warning"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>

          <h3 className="text-base font-bold text-on-surface mt-1">
            Cebu Peak Travel Calibration Active
          </h3>
          
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
            Travel times are adjusted using BPR congestion multiplier. Expect high volumes (e.g., Bulacao-NRA corridor with 11,782 daily passengers).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
        {/* Weather card */}
        <div className={`border rounded-2xl p-3 flex items-center gap-3 ${getWeatherColorClass(weatherCondition)}`}>
          <span className="material-symbols-outlined text-2xl shrink-0">{getWeatherIcon(weatherCondition)}</span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase font-mono tracking-wider font-bold">Cebu Weather</div>
            <div className="text-xs font-bold truncate mt-0.5">
              {weatherDescription} {temperature !== null ? `• ${temperature}°C` : ""}
            </div>
            {betaAdjustment > 0 && (
              <div className="text-[9px] font-medium mt-0.5 opacity-90">
                Rain multiplier added +{betaAdjustment.toFixed(1)} BPR beta
              </div>
            )}
          </div>
        </div>

        {/* Corridor Info */}
        <div className="bg-surface-container-highest/60 border border-outline-variant/20 rounded-2xl p-3 flex items-center gap-3">
          <span className="material-symbols-outlined text-2xl text-cebu-blue shrink-0">alt_route</span>
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-on-surface-variant font-bold">Key Corridor</div>
            <div className="text-xs font-bold text-on-surface mt-0.5">Bulacao-NRA & Banilad</div>
            <div className="text-[9px] text-on-surface-variant font-medium mt-0.5">
              Bottlenecks active: 7-9 AM & 5-8 PM
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
