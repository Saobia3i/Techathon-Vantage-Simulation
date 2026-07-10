"use client";

import { useRobotStore } from "@/state/robotStore";
import * as THREE from "three";
import { useState } from "react";
import { moveToSmooth as moveTo } from "@/lib/animateArm";

import { DebugControls } from "@/components/DebugControls";

const RAD_TO_DEG = 180 / Math.PI;

const KEY_COLORS_MAP: Record<string, string> = {
  "1": "bg-[#ff4d6d]",
  "2": "bg-[#ff8c42]",
  "3": "bg-[#ffe14d]",
  "4": "bg-[#4dffb8]",
  "5": "bg-[#4dc3ff]",
  "6": "bg-[#b44dff]",
};

function formatAngle(rad: number): string {
  return (rad * RAD_TO_DEG).toFixed(1) + "°";
}

function formatPos(v: number): string {
  return v.toFixed(4) + " m";
}

export function Dashboard() {
  const jointNames    = useRobotStore((s) => s.jointNames);
  const currentAngles = useRobotStore((s) => s.currentAngles);
  const robot         = useRobotStore((s) => s.robot);
  const stylusLinkName = useRobotStore((s) => s.stylusLinkName);
  const keyPositions  = useRobotStore((s) => s.keyPositions);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // End-effector world position — derived live from Three.js scene graph
  const endEffectorPos = (() => {
    if (!robot || !stylusLinkName) return null;
    const link = robot.links[stylusLinkName];
    if (!link) return null;
    const v = new THREE.Vector3();
    link.getWorldPosition(v);
    return v;
  })();

  const keyCount = Object.keys(keyPositions).length;

  const handleKeyClick = (digit: string, pos: { x: number; y: number; z: number }) => {
    setStatusMessage(`Moving to Key ${digit}...`);
    
    // Call the moveTo API contract
    const result = moveTo(pos);
    
    setTimeout(() => {
      if (result.success) {
        setStatusMessage(`Reached Key ${digit} (x: ${pos.x}, y: ${pos.y}, z: ${pos.z})`);
      } else {
        setStatusMessage(`Failed: ${result.reason || "unknown error"}`);
      }
    }, 600);
  };

  return (
    <aside className="flex flex-col gap-4 h-full overflow-y-auto bg-[--bg-panel] border-l border-[--border-subtle] px-4 py-5 text-[--text-primary] font-sans">

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[--status-green] animate-pulse" />
        <span className="text-xs font-semibold uppercase tracking-widest text-[--text-secondary] font-sans">
          Live Dashboard
        </span>
      </div>

      {/* ── Status Message Alert ────────────────────────────────────── */}
      {statusMessage && (
        <div className="rounded-lg bg-[--bg-panel] border-l-2 border-[--accent-glow] border-y border-r border-[--border-subtle] px-3 py-2.5 text-xs text-[--text-primary] font-mono shadow-md animate-slide-in flex items-center justify-between">
          <span>{statusMessage}</span>
          <button 
            onClick={() => setStatusMessage(null)}
            className="text-[--text-secondary] hover:text-[--text-primary] font-bold ml-2 cursor-pointer transition-colors"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Joint State ─────────────────────────────────────────────── */}
      <section className="rounded-lg bg-[--bg-panel] border border-[--border-subtle] p-4">
        <h3 className="text-[11px] font-semibold font-sans uppercase tracking-widest text-[--text-secondary] border-b border-[--border-subtle] pb-2 mb-3">
          Joint State
        </h3>

        {jointNames.length === 0 ? (
          <p className="text-xs text-[--text-secondary] italic">Loading URDF…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-[--text-secondary] uppercase font-sans">
                <th className="text-left pb-2 font-medium">Joint</th>
                <th className="text-right pb-2 font-medium">Angle</th>
                <th className="text-right pb-2 font-medium">Rad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--border-subtle]/50">
              {jointNames.map((name, i) => {
                const rad = currentAngles[i] ?? 0;
                return (
                  <tr key={name} className="group even:bg-white/[0.015] hover:bg-white/[0.03] transition-colors">
                    <td className="py-1.5 pr-3 text-[--text-secondary] font-mono text-xs group-hover:text-[--text-primary] transition-colors">
                      {name}
                    </td>
                    <td className="py-1.5 text-right text-[--text-primary] font-mono text-xs tabular-nums">
                      {formatAngle(rad)}
                    </td>
                    <td className="py-1.5 pl-2 text-right text-[--text-secondary]/60 font-mono text-[10px] tabular-nums">
                      {rad.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Debug Nudge Panel ────────────────────────────────────────── */}
      <DebugControls />

      {/* ── End-Effector Position ───────────────────────────────────── */}
      <section className="rounded-lg bg-[--bg-panel] border border-[--border-subtle] p-4">
        <h3 className="text-[11px] font-semibold font-sans uppercase tracking-widest text-[--text-secondary] border-b border-[--border-subtle] pb-2 mb-3">
          End-Effector
        </h3>

        {!stylusLinkName ? (
          <p className="text-xs text-amber-500/80 italic">
            stylusLinkName not set — check console for link names after URDF loads,
            then hardcode in robotStore.ts.
          </p>
        ) : !endEffectorPos ? (
          <p className="text-xs text-[--text-secondary] italic">Waiting for robot…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(["x", "y", "z"] as const).map((axis) => (
              <div
                key={axis}
                className="rounded-lg bg-[--bg-base] border border-[--border-subtle] p-2 text-center"
              >
                <div className="text-[10px] text-[--text-secondary] uppercase mb-1">{axis}</div>
                <div className="font-mono text-xs text-[--text-primary] tabular-nums">
                  {formatPos(endEffectorPos[axis])}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 text-[10px] text-[--text-secondary] font-mono">
          Link: <span className="text-[--text-primary] font-semibold">{stylusLinkName || "—"}</span>
        </div>
      </section>

      {/* ── Key Panel Status ────────────────────────────────────────── */}
      <section className="rounded-lg bg-[--bg-panel] border border-[--border-subtle] p-4">
        <h3 className="text-[11px] font-semibold font-sans uppercase tracking-widest text-[--text-secondary] border-b border-[--border-subtle] pb-2 mb-3">
          Key Panel (Test Panel)
        </h3>

        {keyCount === 0 ? (
          <p className="text-xs text-[--text-secondary] italic">Loading key.config.json…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(keyPositions).map(([digit, pos]) => {
              const borderClasses = {
                "1": "border-l-[#ff4d6d]",
                "2": "border-l-[#ff8c42]",
                "3": "border-l-[#ffe14d]",
                "4": "border-l-[#4dffb8]",
                "5": "border-l-[#4dc3ff]",
                "6": "border-l-[#b44dff]",
              }[digit] || "border-l-[--text-secondary]";

              return (
                <button
                  key={digit}
                  onClick={() => handleKeyClick(digit, pos)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg bg-[--bg-base] border-l-2 border-y border-r border-[--border-subtle] ${borderClasses} hover:border-[--accent-glow] active:scale-95 transition-all text-left group cursor-pointer`}
                  title={`Coords: x=${pos.x.toFixed(3)}, y=${pos.y.toFixed(3)}, z=${pos.z.toFixed(3)}`}
                >
                  <span className="text-xs font-semibold text-[--text-primary] font-sans group-hover:text-[--accent-glow] transition-colors">
                    Key {digit}
                  </span>
                  <span className="text-[9px] text-[--text-secondary] font-mono">
                    {pos.x.toFixed(2)}, {pos.z.toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-2.5 text-[10px] text-[--text-secondary]">
          {keyCount} keys loaded · Click any key to trigger test motion
        </div>
      </section>

      {/* ── Architecture Note ───────────────────────────────────────── */}
      <section className="rounded-lg bg-[--bg-panel] border border-[--border-subtle] p-3 mt-auto">
        <p className="text-[10px] text-[--text-secondary] leading-relaxed">
          All motion goes through <code className="text-[--text-primary] font-semibold">moveTo(x,y,z)</code>.
          This panel is read-only.
        </p>
      </section>
    </aside>
  );
}
