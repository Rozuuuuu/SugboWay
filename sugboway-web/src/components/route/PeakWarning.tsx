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
    <div className="bg-surface-container-high border border-clay/30 rounded-2xl p-5 flex flex-col gap-4 theme-transition animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-clay/10 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-clay text-2xl">warning</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <span className="text-sm font-semibold text-clay">
              {peakLabel} rush
            </span>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-full hover:bg-on-surface/5 text-on-surface-variant transition-colors flex items-center justify-center"
              title="Dismiss"
              aria-label="Dismiss peak traffic warning"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>

          <h3 className="text-base font-bold text-on-surface mt-0.5">
            Roads are busy right now
          </h3>

          <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
            Expect heavier traffic and fuller jeepneys — the Bulacao–NRA corridor alone moves over 11,000 riders a day. Travel times below already account for it.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Weather card */}
        <div className={`border rounded-xl p-3 flex items-center gap-3 ${getWeatherColorClass(weatherCondition)}`}>
          <span className="material-symbols-outlined text-2xl shrink-0">{getWeatherIcon(weatherCondition)}</span>
          <div className="min-w-0">
            <div className="text-xs font-semibold opacity-80">Weather</div>
            <div className="text-sm font-semibold truncate mt-0.5">
              {weatherDescription} {temperature !== null ? `· ${temperature}°C` : ""}
            </div>
            {betaAdjustment > 0 && (
              <div className="text-xs mt-0.5 opacity-90">
                Rain is slowing things down
              </div>
            )}
          </div>
        </div>

        {/* Corridor Info */}
        <div className="bg-surface-container-highest border border-outline-variant/40 rounded-xl p-3 flex items-center gap-3">
          <span className="material-symbols-outlined text-2xl text-cebu-blue shrink-0">alt_route</span>
          <div>
            <div className="text-xs font-semibold text-on-surface-variant">Watch these areas</div>
            <div className="text-sm font-semibold text-on-surface mt-0.5">Bulacao–NRA & Banilad</div>
            <div className="text-xs text-on-surface-variant mt-0.5">
              Worst 7–9 AM & 5–8 PM
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
