"use client";

/**
 * Dashboard — live read-only panel showing joint state + end-effector position.
 *
 * Reads from robotStore (Zustand). Never writes joint values.
 * End-effector position is derived from getWorldPosition() on the stylus link.
 */
import { useRobotStore } from "@/state/robotStore";
import * as THREE from "three";

const RAD_TO_DEG = 180 / Math.PI;

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

  return (
    <aside className="flex flex-col gap-4 h-full overflow-y-auto bg-white border-l border-slate-200/80 px-4 py-5">

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Live Dashboard
        </span>
      </div>

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
          Key Panel
        </h3>

        {keyCount === 0 ? (
          <p className="text-xs text-slate-400 italic">Loading key.config.json…</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {Object.entries(keyPositions).map(([digit, pos]) => (
              <div
                key={digit}
                className="rounded-lg bg-white border border-slate-200 p-1.5 text-center"
              >
                <div className="text-sm font-bold text-slate-800 mb-1">{digit}</div>
                <div className="text-[9px] text-slate-400 font-mono leading-tight">
                  {pos.x.toFixed(2)}<br />
                  {pos.y.toFixed(2)}<br />
                  {pos.z.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 text-[10px] text-slate-400">
          {keyCount} key{keyCount !== 1 ? "s" : ""} loaded · base-frame coords
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
