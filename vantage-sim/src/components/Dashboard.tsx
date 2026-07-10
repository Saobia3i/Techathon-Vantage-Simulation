"use client";

import { useRobotStore } from "@/state/robotStore";
import * as THREE from "three";
import { useState } from "react";
import { moveTo } from "@/lib/moveTo";

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
    <aside className="flex flex-col gap-4 h-full overflow-y-auto bg-white border-l border-slate-200/80 px-4 py-5">

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Live Dashboard
        </span>
      </div>

      {/* ── Status Message Alert ────────────────────────────────────── */}
      {statusMessage && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 font-mono animate-fade-in flex items-center justify-between">
          <span>{statusMessage}</span>
          <button 
            onClick={() => setStatusMessage(null)}
            className="text-blue-400 hover:text-blue-600 font-bold ml-2 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Joint State ─────────────────────────────────────────────── */}
      <section className="rounded-xl bg-slate-50 border border-slate-200/80 p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
          Joint State
        </h3>

        {jointNames.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Loading URDF…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-slate-400 uppercase">
                <th className="text-left pb-2 font-medium">Joint</th>
                <th className="text-right pb-2 font-medium">Angle</th>
                <th className="text-right pb-2 font-medium">Rad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jointNames.map((name, i) => {
                const rad = currentAngles[i] ?? 0;
                return (
                  <tr key={name} className="group">
                    <td className="py-1.5 pr-3 text-slate-500 font-mono text-xs group-hover:text-slate-700 transition-colors">
                      {name}
                    </td>
                    <td className="py-1.5 text-right text-slate-800 font-mono text-xs tabular-nums">
                      {formatAngle(rad)}
                    </td>
                    <td className="py-1.5 pl-2 text-right text-slate-400 font-mono text-[10px] tabular-nums">
                      {rad.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── End-Effector Position ───────────────────────────────────── */}
      <section className="rounded-xl bg-slate-50 border border-slate-200/80 p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
          End-Effector
        </h3>

        {!stylusLinkName ? (
          <p className="text-xs text-amber-600/80 italic">
            stylusLinkName not set — check console for link names after URDF loads,
            then hardcode in robotStore.ts.
          </p>
        ) : !endEffectorPos ? (
          <p className="text-xs text-slate-400 italic">Waiting for robot…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(["x", "y", "z"] as const).map((axis) => (
              <div
                key={axis}
                className="rounded-lg bg-white border border-slate-200 p-2 text-center"
              >
                <div className="text-[10px] text-slate-400 uppercase mb-1">{axis}</div>
                <div className="font-mono text-xs text-slate-800 tabular-nums">
                  {formatPos(endEffectorPos[axis])}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 text-[10px] text-slate-400 font-mono">
          Link: <span className="text-slate-600 font-semibold">{stylusLinkName || "—"}</span>
        </div>
      </section>

      {/* ── Key Panel Status ────────────────────────────────────────── */}
      <section className="rounded-xl bg-slate-50 border border-slate-200/80 p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
          Key Panel (Test Panel)
        </h3>

        {keyCount === 0 ? (
          <p className="text-xs text-slate-400 italic">Loading key.config.json…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(keyPositions).map(([digit, pos]) => (
              <button
                key={digit}
                onClick={() => handleKeyClick(digit, pos)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:shadow-sm active:scale-95 transition-all text-left group cursor-pointer"
                title={`Coords: x=${pos.x.toFixed(3)}, y=${pos.y.toFixed(3)}, z=${pos.z.toFixed(3)}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${KEY_COLORS_MAP[digit] || "bg-slate-400"}`} />
                  <span className="text-xs font-semibold text-slate-700 group-hover:text-blue-500 transition-colors">
                    Key {digit}
                  </span>
                </div>
                <span className="text-[9px] text-slate-400 font-mono">
                  {pos.x.toFixed(2)}, {pos.z.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-2.5 text-[10px] text-slate-400">
          {keyCount} keys loaded · Click any key to trigger test motion
        </div>
      </section>

      {/* ── Architecture Note ───────────────────────────────────────── */}
      <section className="rounded-xl bg-blue-50 border border-blue-100 p-3 mt-auto">
        <p className="text-[10px] text-blue-700/80 leading-relaxed">
          All motion goes through <code className="text-blue-800 font-semibold">moveTo(x,y,z)</code>.
          This panel is read-only.
        </p>
      </section>
    </aside>
  );
}
