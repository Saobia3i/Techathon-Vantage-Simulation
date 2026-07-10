import { SceneWrapper } from "@/components/SceneWrapper";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="flex flex-col h-screen overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-[--border-subtle] bg-[--bg-panel] shrink-0">
        <div className="flex items-center gap-3">
          {/* Vantage logo mark */}
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#8b5e3c] to-[#d4a574] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L13 12H1L7 1Z" fill="white" fillOpacity="0.95" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[--text-primary] tracking-wide font-sans leading-none">
              Vantage Robotics
            </h1>
            <p className="text-[10px] text-[--text-secondary] mt-1 font-mono">
              Digital Twin · Phase 1
            </p>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <StatusChip color="emerald" label="Simulation" />
          <StatusChip color="blue" label="6-DOF Arm" />
          <StatusChip color="violet" label="No Hardware" />
        </div>
      </header>

      {/* ── Main split pane ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 bg-[--bg-base]">

        {/* 3D Viewport — takes remaining space */}
        <div className="flex-1 relative min-w-0">
          <SceneWrapper />

          {/* Overlay hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <p className="text-[10px] text-[--text-secondary] font-mono bg-[--bg-panel]/85 backdrop-blur px-3 py-1.5 rounded-full border border-[--border-subtle]">
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
    emerald: "bg-[--status-green]",
    blue:    "bg-[--status-blue]",
    violet:  "bg-[--accent-glow]",
  }[color];

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[--border-subtle] bg-[--bg-base] text-[--text-secondary] text-xs">
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
