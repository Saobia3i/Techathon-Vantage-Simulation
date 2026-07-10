"use client";

import { useState } from "react";
import { SceneWrapper } from "@/components/SceneWrapper";
import { TelemetryPanel } from "@/components/TelemetryPanel";
import { DashboardControls } from "@/components/DashboardControls";
import { JoystickControls } from "@/components/JoystickControls";
import { KeyboardControls } from "@/components/KeyboardControls";
import { VoiceControls } from "@/components/VoiceControls";
import { PinControls } from "@/components/PinControls";

type SurfaceTab = "dashboard" | "joystick" | "keyboard" | "voice" | "pin";

const TABS: { id: SurfaceTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[15px] h-[15px] shrink-0">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="9" x2="9" y2="20" />
      </svg>
    ),
  },
  {
    id: "joystick",
    label: "Joystick",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[15px] h-[15px] shrink-0">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="2.4" />
      </svg>
    ),
  },
  {
    id: "keyboard",
    label: "Keyboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[15px] h-[15px] shrink-0">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <line x1="6" y1="10" x2="6" y2="10" strokeLinecap="round" strokeWidth="2" />
        <line x1="10" y1="10" x2="10" y2="10" strokeLinecap="round" strokeWidth="2" />
        <line x1="14" y1="10" x2="14" y2="10" strokeLinecap="round" strokeWidth="2" />
        <line x1="8" y1="14" x2="16" y2="14" strokeLinecap="round" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: "voice",
    label: "Voice",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[15px] h-[15px] shrink-0">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    id: "pin",
    label: "Autonomous PIN",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[15px] h-[15px] shrink-0">
        <rect x="4" y="8" width="16" height="12" rx="2" />
        <circle cx="9" cy="14" r="1.2" />
        <circle cx="15" cy="14" r="1.2" />
        <path d="M8 8V5h8v3" />
      </svg>
    ),
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<SurfaceTab>("dashboard");
  const [safetyStatus, setSafetyStatus] = useState<{
    ok: boolean;
    message: string;
  }>({ ok: true, message: "Safety validator: ready" });

  const handleStatusChange = (msg: string, success: boolean, reason?: string) => {
    setSafetyStatus({ ok: success, message: success ? `Safety validator: pass` : `Validator: ${reason || "failed"}` });
  };

  const controlProps = { onStatusChange: handleStatusChange };

  return (
    <div className="min-h-screen bg-[--steel-100]">
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px 64px" }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header
          style={{ borderBottom: "2px solid var(--walnut-700)", paddingBottom: "16px", marginBottom: "18px" }}
          className="flex items-end justify-between gap-6 flex-wrap"
        >
          <div>
            <p
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: "0.12em", fontSize: "12px", color: "var(--copper)", margin: "0 0 4px", textTransform: "uppercase" }}
            >
              Techathon Nationals &middot; Rover Summit
            </p>
            <h1
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "30px", margin: 0, color: "var(--walnut-900)", letterSpacing: "0.01em" }}
            >
              Vantage Robotics — Digital Twin Control Suite
            </h1>
            <p style={{ fontSize: "13px", color: "var(--steel-600)", margin: "5px 0 0" }}>
              Single motion pipeline, five interchangeable control surfaces
            </p>
          </div>

          {/* Dynamic safety status pill */}
          <div
            className="flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-[3px] whitespace-nowrap"
            style={{
              background: safetyStatus.ok ? "var(--safe-bg)" : "#FEE2E2",
              color: safetyStatus.ok ? "var(--safe-text)" : "#B91C1C",
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: safetyStatus.ok ? "var(--safe-text)" : "#B91C1C" }}
            />
            {safetyStatus.message}
          </div>
        </header>

        {/* ── Surface Tabs ────────────────────────────────────────────── */}
        <nav className="flex gap-1.5 mb-5 flex-wrap">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-[3px] border cursor-pointer transition-all"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  background: isActive ? "var(--walnut-700)" : "var(--panel)",
                  borderColor: isActive ? "var(--walnut-700)" : "var(--steel-400)",
                  color: isActive ? "var(--steel-100)" : "var(--steel-600)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--copper)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--walnut-700)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--steel-400)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--steel-600)";
                  }
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* ── Main Grid ────────────────────────────────────────────────── */}
        {/* ── Main Grid ────────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: "20px",
            alignItems: "start",
          }}
          className="grid-layout"
        >
          {/* Column 1 — Scene View & Telemetry Panel (stacked vertically) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Scene View */}
            <div
              className="panel"
              style={{ background: "var(--panel)", border: "1px solid var(--steel-400)", borderRadius: "4px", padding: "18px 20px" }}
            >
              <div className="flex items-center justify-between mb-3">
                <p
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "17px", color: "var(--walnut-900)", margin: 0, letterSpacing: "0.01em" }}
                >
                  Digital twin — scene view
                </p>
                <span className="text-[11px] font-mono text-[--steel-600]">
                  urdf-loader &middot; Three.js
                </span>
              </div>

              {/* 3D Viewport */}
              <div
                className="scene-grid-bg relative overflow-hidden"
                style={{
                  width: "100%",
                  height: "420px",
                  border: "1px solid var(--steel-200)",
                  borderRadius: "3px",
                }}
              >
                <SceneWrapper />
              </div>

              <p style={{ fontSize: "12px", color: "var(--steel-600)", marginTop: "10px", marginBottom: 0 }}>
                Rendered from the provided URDF via urdf-loader. Drag to orbit &middot; scroll to zoom &middot; right-drag to pan.{" "}
                <b style={{ color: "var(--walnut-700)", fontWeight: 500 }}>Approach → touch → retract</b> per digit, verified within ±5 mm.
              </p>
            </div>

            {/* Telemetry (placed below scene view) */}
            <div
              style={{ background: "var(--panel)", border: "1px solid var(--steel-400)", borderRadius: "4px", padding: "18px 20px" }}
            >
              <TelemetryPanel />
            </div>
          </div>

          {/* Column 2 — Active Control Surface */}
          <div
            className="panel"
            style={{ background: "var(--panel)", border: "1px solid var(--steel-400)", borderRadius: "4px", padding: "18px 20px" }}
          >
            <p
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--walnut-700)", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              Control Surface — {TABS.find((t) => t.id === activeTab)?.label}
            </p>

            {activeTab === "dashboard" && <DashboardControls {...controlProps} />}
            {activeTab === "joystick" && <JoystickControls {...controlProps} />}
            {activeTab === "keyboard" && <KeyboardControls {...controlProps} />}
            {activeTab === "voice" && <VoiceControls {...controlProps} />}
            {activeTab === "pin" && <PinControls {...controlProps} />}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer
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
        @media (max-width: 960px) {
          .grid-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
