import { useState, useEffect, useRef } from "react";
import type { RouteLeg } from "@/domain";

interface ProximityState {
  isApproaching: boolean;
  distanceToStop: number | null;
  nextStopName: string | null;
  isMuted: boolean;
}

export function useProximityEtiquette(activeLeg: RouteLeg | null) {
  const [state, setState] = useState<ProximityState>({
    isApproaching: false,
    distanceToStop: null,
    nextStopName: null,
    isMuted: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastAlertStopIdRef = useRef<string | null>(null);

  // Initialize and load mute setting
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedMute = localStorage.getItem("sugboway_proximity_mute") === "true";
      setState((prev) => ({ ...prev, isMuted: storedMute }));
    }
  }, []);

  const toggleMute = () => {
    setState((prev) => {
      const newMute = !prev.isMuted;
      localStorage.setItem("sugboway_proximity_mute", String(newMute));
      return { ...prev, isMuted: newMute };
    });
  };

  const playSoftChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      // Soft cultural chime: Double-tap ping ("cling-cling") representing coin-tapping on jeepney ceiling rails
      const playTap = (delay: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, ctx.currentTime + delay); // High-pitched metallic ring
        gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);

        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.3);
      };

      // Tap 1
      playTap(0);
      // Tap 2 (180ms later)
      playTap(0.18);
    } catch (err) {
      console.error("[ProximityEtiquette] Failed to play chime:", err);
    }
  };

  const triggerEtiquetteActions = (stopName: string) => {
    // 1. Vibration alert (2 short pulses)
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([150, 100, 150]);
    }

    // 2. Audio Chime (if not muted)
    if (!state.isMuted) {
      playSoftChime();
    }

    // 3. Web Notification (if permission is granted)
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("SugboWay: Lugar Lang Alert!", {
        body: `Approaching ${stopName}. Say "Lugar lang sa unahan" and prepare your fare!`,
        icon: "/favicon.ico",
      });
    }
  };

  const dismissAlert = () => {
    setState((prev) => ({ ...prev, isApproaching: false }));
  };

  // Helper: Haversine distance formula in meters
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  useEffect(() => {
    // Geolocation watcher
    if (typeof window === "undefined" || !navigator.geolocation || !activeLeg || activeLeg.type !== "transit") {
      setState((prev) => ({ ...prev, isApproaching: false, distanceToStop: null, nextStopName: null }));
      return;
    }

    const targetLat = activeLeg.toStop.location.lat;
    const targetLon = activeLeg.toStop.location.lon;
    const stopId = activeLeg.toStop.stopId;
    const stopName = activeLeg.toStop.stopName;

    // Request Notification permission proactively
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    console.log(`[ProximityEtiquette] Tracking approach to stop: ${stopName} (${targetLat}, ${targetLon})`);

    const onPositionUpdate = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      const distance = getDistanceMeters(latitude, longitude, targetLat, targetLon);

      console.log(`[ProximityEtiquette] Live position: (${latitude}, ${longitude}). Distance to ${stopName}: ${distance.toFixed(1)}m`);

      const inRange = distance <= 200;

      setState((prev) => {
        const wasApproaching = prev.isApproaching;
        
        // Trigger actions if we just entered the 200m radius for this stop
        if (inRange && !wasApproaching && lastAlertStopIdRef.current !== stopId) {
          lastAlertStopIdRef.current = stopId;
          triggerEtiquetteActions(stopName);
        }

        return {
          ...prev,
          isApproaching: inRange,
          distanceToStop: Math.round(distance),
          nextStopName: stopName,
        };
      });
    };

    const onError = (error: GeolocationPositionError) => {
      console.warn("[ProximityEtiquette] Geolocation error:", error.message);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(onPositionUpdate, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeLeg]);

  return {
    isApproaching: state.isApproaching,
    distanceToStop: state.distanceToStop,
    nextStopName: state.nextStopName,
    isMuted: state.isMuted,
    toggleMute,
    dismissAlert,
  };
}
