"use client";

import { useCallback, useState } from "react";
import { SceneWrapper } from "@/components/SceneWrapper";
import { TelemetryPanel } from "@/components/TelemetryPanel";
import { DashboardControls } from "@/components/DashboardControls";
import { JoystickControl } from "@/components/JoystickControl";
import { KeyboardControls } from "@/components/KeyboardControls";
import VoiceControlPanel from "@/components/VoiceControlPanel";
import PinControls from "@/components/PinControls";
import { JointPreviewOverlay } from "@/components/JointPreviewOverlay";
import { formatSafetyReason } from "@/lib/safetyMessages";

export default function Home() {
  const [safetyStatus, setSafetyStatus] = useState<{
    ok: boolean;
    message: string;
  }>({ ok: true, message: "Safety validator: ready" });

  const handleStatusChange = useCallback((msg: string, success: boolean, reason?: string) => {
    setSafetyStatus({ ok: success, message: success ? "Safety validator: pass" : formatSafetyReason(reason) });
  }, []);

  return (
    <div className="min-h-screen bg-[--steel-100]">
      {/* Rotation alert overlay for mobile portrait mode */}
      <div className="rotate-overlay">
        <div className="flex flex-col items-center justify-center">
          <svg className="animate-rotate w-14 h-14 text-[--copper] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <circle cx="12" cy="19" r="1" />
            <path d="M17 12a5 5 0 0 0-5-5m5 5H12" strokeLinecap="round" />
            <path d="M7 12a5 5 0 0 0 5 5" strokeLinecap="round" />
          </svg>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "22px", fontWeight: 600, color: "var(--copper)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Rotation Required
          </h2>
          <p style={{ fontSize: "12px", color: "var(--steel-300)", maxWidth: "260px", margin: 0, lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
            Please rotate your device to landscape mode for the digital twin simulator experience.
          </p>
        </div>
      </div>

      <div className="app-container">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="app-header flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p
              className="app-tagline"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: "0.12em", fontSize: "12px", color: "var(--copper)", margin: "0 0 4px", textTransform: "uppercase" }}
            >
              Techathon Nationals &middot; Rover Summit
            </p>
            <h1 className="app-title">
              Vantage Robotics — Digital Twin Control Suite
            </h1>
            <p className="app-subtitle" style={{ color: "var(--steel-600)" }}>
              Integrated video game cockpit HUD — all controls active simultaneously
            </p>
          </div>

          {/* Dynamic safety status pill */}
          <div
            className="app-safety-pill flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-[3px] whitespace-nowrap"
            style={{
              background: safetyStatus.ok ? "var(--safe-bg)" : "#FEE2E2",
              color: safetyStatus.ok ? "var(--safe-text)" : "#B91C1C",
            }}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: safetyStatus.ok ? "var(--safe-text)" : "#B91C1C" }}
            />
            {safetyStatus.message}
          </div>
        </header>

        {/* ── Main Viewport and Telemetry ──────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* 3D Viewport with Game HUD Overlays */}
          <div className="scene-grid-bg scene-container relative overflow-hidden w-full border border-[--steel-400] rounded">
            <SceneWrapper />
            
            {/* Top-Right Overlay: Telemetry Compass */}
            <div className="absolute top-3 right-3 z-20 hud-scale-right">
              <JointPreviewOverlay />
            </div>

            {/* Top-Center Overlay: Keyboard Shortcuts Legend */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 hud-scale-top-center">
              <div className="flex gap-3 bg-[--panel]/85 backdrop-blur-md border border-[--steel-400]/40 rounded-full px-3.5 py-1.5 text-[8.5px] font-sans font-semibold text-[--walnut-900] shadow-md select-none pointer-events-none uppercase tracking-wider whitespace-nowrap">
                <span>W/S: ↔ Z (FWD/BACK)</span>
                <span className="text-[--steel-400]/50">|</span>
                <span>A/D: ↔ X (LEFT/RIGHT)</span>
                <span className="text-[--steel-400]/50">|</span>
                <span>Q/E: ↕ Y (UP/DOWN)</span>
                <span className="text-[--steel-400]/50">|</span>
                <span>Shift: Fine</span>
              </div>
            </div>

            {/* Bottom-Left Overlay: Joystick Controls */}
            <div className="absolute bottom-3 left-3 z-20 hud-scale-bottom-left">
              <JoystickControl onStatusChange={handleStatusChange} isHUD={true} />
            </div>

            {/* Bottom-Right Overlay: Target & Nudges */}
            <div className="absolute bottom-3 right-3 z-20 hud-scale-bottom-right">
              <DashboardControls onStatusChange={handleStatusChange} isHUD={true} />
            </div>

            {/* Top-Left Overlay: Voice & PIN Keypad Stack */}
            <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 hud-scale-left">
              <VoiceControlPanel onStatusChange={handleStatusChange} isHUD={true} />
              <PinControls onStatusChange={handleStatusChange} isHUD={true} />
            </div>

            {/* Bottom-Center Overlay: Keyboard Status Pill */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
              <KeyboardControls onStatusChange={handleStatusChange} isHUD={true} />
            </div>
          </div>

          {/* Under-Scene Telemetry Dashboard */}
          <div className="telemetry-wrapper">
            <TelemetryPanel />
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer
          className="app-footer"
          style={{ marginTop: "22px", paddingTop: "14px", borderTop: "1px solid var(--steel-200)", fontSize: "12px", color: "var(--steel-600)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}
        >
          <span>Vantage Robotics — Proposed Solution &middot; Rover Summit Dry Run</span>
          <span>
            Every input adapter routes through{" "}
            <b style={{ color: "var(--walnut-700)" }}>moveTo(x, y, z)</b> — no path bypasses the safety validator
          </span>
        </footer>
      </div>

      <style>{`
        :root {
          --viewport-height: 600px;
        }

        .app-container {
          max-width: 1320px;
          margin: 0 auto;
          padding: 28px 24px 64px;
        }

        .app-header {
          border-bottom: 2px solid var(--walnut-700);
          padding-bottom: 16px;
          margin-bottom: 18px;
        }

        .app-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 600;
          font-size: 30px;
          margin: 0;
          color: var(--walnut-900);
          letter-spacing: 0.01em;
        }

        .app-subtitle {
          font-size: 13px;
          margin: 5px 0 0;
        }

        .scene-container {
          height: var(--viewport-height);
          transition: height 0.3s ease;
        }

        .telemetry-wrapper {
          background: var(--panel);
          border: 1px solid var(--steel-400);
          border-radius: 4px;
          padding: 18px 20px;
        }

        .rotate-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(26, 22, 19, 0.96);
          backdrop-filter: blur(12px);
          z-index: 99999;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--steel-100);
          text-align: center;
          padding: 24px;
        }

        @keyframes rotate-phone {
          0% { transform: rotate(0deg); }
          50% { transform: rotate(-90deg); }
          100% { transform: rotate(-90deg); }
        }
        
        .animate-rotate {
          animation: rotate-phone 2.2s ease-in-out infinite;
        }

        @media (max-width: 960px) {
          :root {
            --viewport-height: 310px;
          }
          .app-container {
            padding: 8px 12px 16px !important;
          }
          .app-header {
            padding-bottom: 8px !important;
            margin-bottom: 8px !important;
          }
          .app-tagline {
            font-size: 10px !important;
            margin-bottom: 2px !important;
          }
          .app-title {
            font-size: 18px !important;
          }
          .app-subtitle {
            font-size: 10px !important;
            margin-top: 1px !important;
          }
          .app-safety-pill {
            font-size: 10px !important;
            padding: 4px 8px !important;
          }
          .telemetry-wrapper {
            padding: 8px 12px !important;
          }
          .app-footer {
            margin: 12px 0 0 !important;
            padding-top: 8px !important;
            font-size: 10px !important;
          }
          .hud-scale-left {
            transform: scale(0.65);
            transform-origin: top left;
          }
          .hud-scale-right {
            transform: scale(0.65);
            transform-origin: top right;
          }
          .hud-scale-bottom-left {
            transform: scale(0.65);
            transform-origin: bottom left;
          }
          .hud-scale-bottom-right {
            transform: scale(0.65);
            transform-origin: bottom right;
          }
          .hud-scale-top-center {
            transform: scale(0.65);
            transform-origin: top center;
          }
        }

        @media (max-width: 960px) and (orientation: portrait) {
          .rotate-overlay {
            display: flex;
          }
          .app-container {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
