"use client";

import { useRobotStore } from "@/state/robotStore";
import * as THREE from "three";
import { useEffect, useState } from "react";

const RAD_TO_DEG = 180 / Math.PI;

export function TelemetryPanel() {
  const { robot, jointNames, currentAngles, jointLimits, stylusLinkName } = useRobotStore();
  const [eePosition, setEePosition] = useState<THREE.Vector3 | null>(null);

  // Poll end-effector position from Three.js scene graph in real-time
  useEffect(() => {
    let animFrame: number;
    function updateEe() {
      if (robot && stylusLinkName) {
        const link = robot.links[stylusLinkName];
        if (link) {
          const v = new THREE.Vector3();
          link.getWorldPosition(v);
          
          // The target positions are in the robot's local base coordinate frame.
          // To display coordinates consistent with key.config.json and local commands,
          // we convert the world end-effector position back into the robot's local base frame.
          const localPos = robot.worldToLocal(v);
          setEePosition(localPos);
        }
      }
      animFrame = requestAnimationFrame(updateEe);
    }
    updateEe();
    return () => cancelAnimationFrame(animFrame);
  }, [robot, stylusLinkName]);

  return (
    <div className="panel telemetry flex flex-col gap-6">
      {/* ── Joint Angles ──────────────────────────────────────────────── */}
      <div>
        <p className="panel-title text-[15px] font-semibold font-sans uppercase tracking-wide text-[--walnut-900] border-b border-[--steel-200] pb-1.5 mb-3">
          Joint Angles
        </p>
        
        {jointNames.length === 0 ? (
          <p className="text-xs text-[--steel-600] italic font-sans">
            Robot not loaded...
          </p>
        ) : (
          <div className="space-y-3.5">
            {jointNames.map((name, i) => {
              const angleRad = currentAngles[i] ?? 0;
              const angleDeg = angleRad * RAD_TO_DEG;
              
              // Calculate limit range & progress percentage
              const limits = jointLimits[i];
              let pct = 50; // default middle
              if (limits && limits.upper !== limits.lower) {
                const range = limits.upper - limits.lower;
                pct = ((angleRad - limits.lower) / range) * 100;
              } else {
                pct = ((angleRad + Math.PI) / (2 * Math.PI)) * 100;
              }
              pct = Math.min(100, Math.max(0, pct));

              // Format joint label (e.g. "joint1" -> "J1 base")
              const displayLabel = {
                joint1: "J1 base",
                joint2: "J2 shoulder",
                joint3: "J3 elbow",
                joint4: "J4 wrist 1",
                joint5: "J5 wrist 2",
                joint6: "J6 wrist 3",
                stylus_joint: "Stylus fixed",
              }[name] || name;

              if (name === "stylus_joint") return null; // Skip fixed joint

              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="joint-label text-xs text-[--steel-600] w-20 shrink-0 font-sans font-medium">
                    {displayLabel}
                  </span>
                  <div className="joint-track flex-1 h-1.5 bg-[--steel-200] rounded-full overflow-hidden">
                    <div
                      className="joint-fill h-full bg-[--copper] transition-all duration-75"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="joint-val text-xs text-[--walnut-900] font-mono w-12 text-right">
                    {angleDeg.toFixed(0)}&deg;
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="divider border-t border-[--steel-200]" />

      {/* ── End-Effector Position ────────────────────────────────────── */}
      <div>
        <p className="panel-title text-[15px] font-semibold font-sans uppercase tracking-wide text-[--walnut-900] border-b border-[--steel-200] pb-1.5 mb-3">
          End-Effector (Base Frame)
        </p>
        <div className="space-y-1.5 font-mono text-xs">
          <div className="ee-row flex justify-between border-b border-[--steel-200]/40 pb-1">
            <span className="text-[--steel-600] font-sans">x</span>
            <span className="text-[--walnut-900] font-semibold">
              {eePosition ? `${eePosition.x.toFixed(4)} m` : "—"}
            </span>
          </div>
          <div className="ee-row flex justify-between border-b border-[--steel-200]/40 pb-1">
            <span className="text-[--steel-600] font-sans">y</span>
            <span className="text-[--walnut-900] font-semibold">
              {eePosition ? `${eePosition.y.toFixed(4)} m` : "—"}
            </span>
          </div>
          <div className="ee-row flex justify-between border-b border-[--steel-200]/40 pb-1">
            <span className="text-[--steel-600] font-sans">z</span>
            <span className="text-[--walnut-900] font-semibold">
              {eePosition ? `${eePosition.z.toFixed(4)} m` : "—"}
            </span>
          </div>
        </div>
        <p className="ee-label text-[11px] text-[--steel-600] font-sans mt-3 font-medium">
          Tolerance &plusmn;5 mm
        </p>
      </div>
    </div>
  );
}
