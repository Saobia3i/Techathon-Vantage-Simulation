"use client";

import { useRobotStore } from "@/state/robotStore";
import { useEffect, useState, useRef } from "react";
import * as THREE from "three";

export function JointPreviewOverlay() {
  const { robot, jointNames, currentAngles, lastIKReport } = useRobotStore();
  const [eePos, setEePos] = useState({ x: 0, y: 0, z: 0 });
  const lastUpdate = useRef(0);

  // Read the physical stylus tip coordinate in real-time
  useEffect(() => {
    if (!robot) return;
    const name = useRobotStore.getState().stylusLinkName || "stylus_tip";
    const eeLink = robot.links[name];
    if (!eeLink) return;

    let rafId: number;
    const update = () => {
      const now = performance.now();
      // Throttling to 15fps to keep rendering fast and lightweight
      if (now - lastUpdate.current > 66) {
        robot.updateMatrixWorld(true);
        const v = eeLink.localToWorld(new THREE.Vector3(0, 0, 0.04));
        setEePos({ x: v.x, y: v.y, z: v.z });
        lastUpdate.current = now;
      }
      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [robot, currentAngles]);

  if (!robot || jointNames.length === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-20 w-[240px] bg-[--panel]/85 backdrop-blur-md border border-[--steel-400]/40 rounded-lg p-3 shadow-lg font-mono text-[10px] text-[--walnut-900] select-none">
      <div className="border-b border-[--steel-400]/30 pb-1.5 mb-2 flex items-center justify-between">
        <span className="font-bold tracking-wider text-[--walnut-700] uppercase font-sans text-[9px]">
          REAL-TIME TELEMETRY HUD
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      {/* Cartesian Position */}
      <div className="space-y-0.5 mb-2.5">
        <p className="font-bold font-sans text-[9px] text-[--steel-600] uppercase tracking-wide mb-1">
          End-Effector Tip (World)
        </p>
        <div className="grid grid-cols-3 gap-1 bg-[--steel-100]/60 p-1.5 rounded border border-[--steel-200]/40 text-center">
          <div>
            <span className="text-[9px] text-[--steel-600] block">X</span>
            <span className="font-bold font-mono">{eePos.x.toFixed(3)}m</span>
          </div>
          <div>
            <span className="text-[9px] text-[--steel-600] block">Y</span>
            <span className="font-bold font-mono">{eePos.y.toFixed(3)}m</span>
          </div>
          <div>
            <span className="text-[9px] text-[--steel-600] block">Z</span>
            <span className="font-bold font-mono">{eePos.z.toFixed(3)}m</span>
          </div>
        </div>
      </div>

      {/* Joint Space Configuration */}
      <div className="space-y-1 mb-2.5">
        <p className="font-bold font-sans text-[9px] text-[--steel-600] uppercase tracking-wide mb-1">
          Joint Space (Angle Axis)
        </p>
        <div className="max-h-[100px] overflow-y-auto space-y-0.5 pr-0.5">
          {jointNames.map((name, i) => {
            const joint = robot.joints[name];
            const rad = currentAngles[i] ?? 0;
            const deg = (rad * 180) / Math.PI;
            const axis = joint?.axis ? `[${joint.axis.x},${joint.axis.y},${joint.axis.z}]` : "n/a";
            return (
              <div
                key={name}
                className="flex items-center justify-between py-0.5 border-b border-[--steel-200]/20 last:border-0"
              >
                <span className="text-[9px] font-bold text-[--walnut-700] w-12 truncate">{name}</span>
                <span className="text-[8px] text-[--steel-600] shrink-0 font-sans mr-2">{axis}</span>
                <span className="font-mono text-right shrink-0">
                  {deg > 0 ? "+" : ""}
                  {deg.toFixed(1)}° <span className="text-[8px] text-[--steel-600]">({rad.toFixed(2)}r)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Safety Layer Indicator */}
      <div className="border-t border-[--steel-400]/20 pt-2 flex items-center justify-between">
        <span className="text-[9px] font-sans text-[--steel-600] uppercase">Motion Pipeline:</span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 text-[9px] font-sans font-bold">
          {lastIKReport?.success === false ? `BLOCKED (${lastIKReport?.reason || "error"})` : "ACTIVE / SAFE"}
        </span>
      </div>
    </div>
  );
}
