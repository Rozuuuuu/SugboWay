"use client";

import React, { useState, useEffect } from "react";
import type { RouteResult, PassengerType, RouteLeg } from "@/domain";
import { formatPHP, calculateFare } from "@/domain";
import RouteCodeBadge from "./RouteCodeBadge";

interface NavigationDrawerProps {
  route: RouteResult | null;
  passengerType: PassengerType;
  isOpen: boolean;
  onClose: () => void;
}

export default function NavigationDrawer({
  route,
  passengerType,
  isOpen,
  onClose,
}: NavigationDrawerProps) {
  const [activeLegIndex, setActiveLegIndex] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [simulatedDistanceRemaining, setSimulatedDistanceRemaining] = useState(500); // meters
  const [showProximityAlert, setShowProximityAlert] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveLegIndex(0);
      setActiveStepIndex(0);
      setSimulatedDistanceRemaining(500);
      setShowProximityAlert(false);
    }
  }, [isOpen, route]);

  if (!isOpen || !route) return null;

  const legs = route.legs;
  const currentLeg = legs[activeLegIndex];
  if (!currentLeg) return null;

  const instructions = currentLeg.instructions || [];
  const currentInstruction = instructions[activeStepIndex];

  // Etiquette cues based on progress step action type
  const getEtiquetteCue = (action?: string) => {
    switch (action) {
      case "board":
        return {
          title: "Boarding Etiquette",
          cue: "Signal the driver by waving your palm downwards. Traditional jeepneys stop anywhere, but E-Jeeps require designated stops.",
          cebuano: "Sakay na! Iwara-wara imong kamot paubos para mopadaplin ang jeep.",
          icon: "front_hand"
        };
      case "ride":
        return {
          title: "Payment Etiquette",
          cue: "Pass your fare forward and say 'Bayad palihug' clearly. If you are far, other passengers will help pass it to the driver.",
          cebuano: "Paki-tunol sa plete unya ingna 'Bayad palihug' sa tapad nimo.",
          icon: "payments"
        };
      case "alight":
        return {
          title: "Alighting Etiquette",
          cue: "Say 'Lugar lang sa unahan' clearly or tap a coin on the overhead metal handrail to signal the driver.",
          cebuano: "Ingna 'Lugar lang, pabor' o i-tuktok ang sinsilyo sa puthaw.",
          icon: "hail"
        };
      default:
        return {
          title: "Commuter Etiquette",
          cue: "Be courteous to fellow passengers. Offer seats to senior citizens, pregnant women, and PWDs.",
          cebuano: "Palihug i-reserba ang lingkoranan para sa mga tiguwang o PWD.",
          icon: "volunteer_activism"
        };
    }
  };

  const currentCue = getEtiquetteCue(currentInstruction?.action);

  // Handle step progression simulation
  const handleNextStep = () => {
    if (activeStepIndex < instructions.length - 1) {
      setActiveStepIndex(activeStepIndex + 1);
      
      // Simulate proximity alert on reaching the alighting step
      const nextInstruction = instructions[activeStepIndex + 1];
      if (nextInstruction?.action === "alight") {
        setSimulatedDistanceRemaining(180); // Under 200m
        setShowProximityAlert(true);
      }
    } else if (activeLegIndex < legs.length - 1) {
      setActiveLegIndex(activeLegIndex + 1);
      setActiveStepIndex(0);
      setSimulatedDistanceRemaining(500);
      setShowProximityAlert(false);
    } else {
      // Completed ride simulation
      onClose();
    }
  };

  const handlePrevStep = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1);
      setShowProximityAlert(false);
      setSimulatedDistanceRemaining(500);
    } else if (activeLegIndex > 0) {
      setActiveLegIndex(activeLegIndex - 1);
      setActiveStepIndex(legs[activeLegIndex - 1].instructions.length - 1);
      setShowProximityAlert(false);
    }
  };
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center bg-black/65 backdrop-blur-xs select-none">
      <div
        className="
          w-full max-w-lg bg-surface border border-outline-variant rounded-lg p-6 mb-28 md:mb-6 mx-4 shadow-2xl
          animate-[slideUp_0.3s_ease-out] space-y-6 max-h-[70vh] md:max-h-[85vh] overflow-y-auto theme-transition
        "
      >
        {/* Top Header */}
        <div className="flex justify-between items-center pb-3 border-b border-outline-variant/30">
          <div className="flex items-center gap-2.5">
            <span className="sw-brand-tile w-8 h-8 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-lg">navigation</span>
            </span>
            <h2 className="text-lg font-extrabold tracking-tight text-on-surface">
              Step-by-step
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 hover:bg-surface-container-high rounded-full text-on-surface-variant transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Proximity Alert Banner */}
        {showProximityAlert && (
          <div className="bg-error-container/15 border-l-4 border-error rounded-xl p-4 flex gap-3 items-center">
            <span className="material-symbols-outlined text-error text-2xl">notifications_active</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-error">Almost there</span>
                <span className="text-sm text-error tabular-nums">· {simulatedDistanceRemaining}m</span>
              </div>
              <p className="text-sm text-on-surface-variant mt-1">
                Your stop is close — say <span className="font-semibold text-on-surface">"Lugar lang"</span> to let the driver know.
              </p>
            </div>
          </div>
        )}

        {/* Route Info */}
        <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <RouteCodeBadge code={currentLeg.routeShortName || "Transit"} size="sm" />
            <div>
              <p className="text-xs font-bold text-on-surface">
                {currentLeg.route?.routeLongName || "Transit Connection"}
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Step {activeStepIndex + 1} of {instructions.length} · Leg {activeLegIndex + 1} of {legs.length}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="relative pt-1 space-y-1.5">
          <div className="flex justify-between items-center gap-2 text-xs text-on-surface-variant font-medium">
            <span className="truncate">{currentLeg.fromStop.stopName}</span>
            <span className="truncate text-right">{currentLeg.toStop.stopName}</span>
          </div>
          <div className="overflow-hidden h-1.5 text-xs flex rounded bg-outline-variant/30 relative">
            <div
              style={{ width: `${((activeStepIndex + 1) / instructions.length) * 100}%`, background: "var(--sw-gradient-sea)" }}
              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500"
            />
          </div>
        </div>

        {/* Step Guide Detail */}
        <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/40">
          <h4 className="text-base font-bold text-on-surface">
            {currentInstruction?.description || "Follow the directions."}
          </h4>
          {currentInstruction?.landmark && (
            <span className="text-sm text-safe-green font-medium mt-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-base">tour</span>
              Look for {currentInstruction.landmark}
            </span>
          )}
        </div>

        {/* Cebuano etiquette tip */}
        <div className="bg-cebu-blue/5 border border-cebu-blue/15 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-cebu-blue">
            <span className="material-symbols-outlined text-lg">{currentCue.icon}</span>
            <h4 className="text-sm font-bold">{currentCue.title}</h4>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {currentCue.cue}
          </p>
          <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/30">
            <span className="text-xs text-on-surface-variant block">Say it in Bisaya</span>
            <p className="text-sm font-semibold text-cebu-blue italic mt-1 leading-relaxed">
              "{currentCue.cebuano}"
            </p>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="flex gap-3 justify-between">
          <button 
            onClick={handlePrevStep}
            disabled={activeLegIndex === 0 && activeStepIndex === 0}
            className="flex-1 bg-surface-container-high hover:bg-surface-container-highest disabled:bg-surface-container-low text-on-surface-variant disabled:text-outline font-bold py-3 rounded-xl transition-all active:scale-95 disabled:active:scale-100 text-xs border border-outline-variant/30 select-none"
          >
            Back Step
          </button>
          
          <button
            onClick={handleNextStep}
            className="sw-btn-primary flex-1 font-bold py-3 rounded-xl text-xs select-none flex items-center justify-center gap-1.5"
          >
            <span>
              {activeLegIndex === legs.length - 1 && activeStepIndex === instructions.length - 1 
                ? "Complete Ride" 
                : "Next Step"
              }
            </span>
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
