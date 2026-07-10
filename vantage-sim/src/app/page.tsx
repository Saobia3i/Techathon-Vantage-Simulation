import { SceneWrapper } from "@/components/SceneWrapper";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="flex flex-col h-screen overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200/80 bg-white shrink-0">
        <div className="flex items-center gap-3">
          {/* Vantage logo mark */}
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L13 12H1L7 1Z" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-800 leading-none">
              Vantage Robotics
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
              Digital Twin · Phase 1
            </p>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <StatusChip color="emerald" label="Simulation" />
          <StatusChip color="blue" label="6-DOF Arm" />
          <StatusChip color="violet" label="No Hardware" />
        </div>
      </header>

      {/* ── Main split pane ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* 3D Viewport — takes remaining space */}
        <div className="flex-1 relative min-w-0">
          <SceneWrapper />

          {/* Overlay hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <p className="text-[10px] text-slate-500 font-mono bg-white/80 backdrop-blur px-3 py-1.5 rounded-full border border-slate-200/80">
              Drag to orbit · Scroll to zoom · Right-drag to pan
            </p>
          </div>
        </div>

        {/* Dashboard sidebar — fixed 300px */}
        <div className="w-[300px] shrink-0 overflow-hidden">
          <Dashboard />
        </div>
      </div>
    </main>
  );
}

function StatusChip({
  color,
  label,
}: {
  color: "emerald" | "blue" | "violet";
  label: string;
}) {
  const dotClass = {
    emerald: "bg-emerald-500",
    blue:    "bg-blue-500",
    violet:  "bg-violet-500",
  }[color];

  return (
    <div className="flex items-center gap-1.5 text-slate-500">
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {label}
    </div>
  );
}
