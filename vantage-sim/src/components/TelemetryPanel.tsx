"use client";

import { useRobotStore } from "@/state/robotStore";
import * as THREE from "three";
import { useEffect, useState } from "react";
import { getStylusTipWorldPosition } from "@/lib/stylusTip";

const RAD_TO_DEG = 180 / Math.PI;

export function TelemetryPanel() {
  const { robot, jointNames, currentAngles, jointLimits, stylusLinkName, lastIKReport } = useRobotStore();
  const [eeWorldPosition, setEeWorldPosition] = useState<THREE.Vector3 | null>(null);
  const [eeBasePosition, setEeBasePosition] = useState<THREE.Vector3 | null>(null);

  useEffect(() => {
    let animFrame: number;

    function updateEe() {
      if (robot && stylusLinkName) {
        const world = getStylusTipWorldPosition(robot, stylusLinkName);
        if (world) {
          setEeWorldPosition(world.clone());
          setEeBasePosition(robot.worldToLocal(world.clone()));
        }
      }
      animFrame = requestAnimationFrame(updateEe);
    }

    updateEe();
    return () => cancelAnimationFrame(animFrame);
  }, [robot, stylusLinkName]);

  return (
    <div className="panel telemetry flex flex-col gap-6">
      <div>
        <p className="panel-title text-[15px] font-semibold font-sans uppercase tracking-wide text-[--walnut-900] border-b border-[--steel-200] pb-1.5 mb-3">
          Joint Angles
        </p>

        {jointNames.length === 0 ? (
          <p className="text-xs text-[--steel-600] italic font-sans">Robot not loaded...</p>
        ) : (
          <div className="space-y-3.5">
            {jointNames.map((name, i) => {
              if (name === "stylus_joint") return null;

              const angleRad = currentAngles[i] ?? 0;
              const angleDeg = angleRad * RAD_TO_DEG;
              const limits = jointLimits[i];
              let pct = 50;

              if (limits && limits.upper !== limits.lower) {
                pct = ((angleRad - limits.lower) / (limits.upper - limits.lower)) * 100;
              } else {
                pct = ((angleRad + Math.PI) / (2 * Math.PI)) * 100;
              }
              pct = Math.min(100, Math.max(0, pct));

              const displayLabel =
                {
                  joint1: "J1 base",
                  joint2: "J2 shoulder",
                  joint3: "J3 elbow",
                  joint4: "J4 wrist 1",
                  joint5: "J5 wrist 2",
                  joint6: "J6 wrist 3",
                }[name] || name;

              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="joint-label text-xs text-[--steel-600] w-20 shrink-0 font-sans font-medium">
                    {displayLabel}
                  </span>
                  <div className="joint-track flex-1 h-1.5 bg-[--steel-200] rounded-full overflow-hidden">
                    <div className="joint-fill h-full bg-[--copper] transition-all duration-75" style={{ width: `${pct}%` }} />
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

      <div>
        <p className="panel-title text-[15px] font-semibold font-sans uppercase tracking-wide text-[--walnut-900] border-b border-[--steel-200] pb-1.5 mb-3">
          End-Effector Coordinates
        </p>
        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          {[
            ["World frame", eeWorldPosition],
            ["Base frame", eeBasePosition],
          ].map(([label, pos]) => (
            <div key={label as string} className="space-y-1.5">
              <p className="text-[10px] text-[--steel-600] font-sans uppercase tracking-wide">{label as string}</p>
              {(["x", "y", "z"] as const).map((axis) => (
                <div key={axis} className="ee-row flex justify-between border-b border-[--steel-200]/40 pb-1">
                  <span className="text-[--steel-600] font-sans">{axis}</span>
                  <span className="text-[--walnut-900] font-semibold">
                    {pos ? `${(pos as THREE.Vector3)[axis].toFixed(4)} m` : "-"}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="ee-label text-[11px] text-[--steel-600] font-sans mt-3 font-medium">
          moveTo uses world frame. Tolerance +/-5 mm.
        </p>
      </div>

      <div className="divider border-t border-[--steel-200]" />

      <div>
        <p className="panel-title text-[15px] font-semibold font-sans uppercase tracking-wide text-[--walnut-900] border-b border-[--steel-200] pb-1.5 mb-3">
          IK Equation Output
        </p>
        {!lastIKReport ? (
          <p className="text-xs text-[--steel-600] italic font-sans">Run a motion to see equation output.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="rounded border border-[--steel-200] p-2">
                <p className="font-sans text-[10px] uppercase text-[--steel-600] mb-1">Target</p>
                <p className="text-[--walnut-900]">
                  ({lastIKReport.targetWorld.x.toFixed(4)}, {lastIKReport.targetWorld.y.toFixed(4)}, {lastIKReport.targetWorld.z.toFixed(4)})
                </p>
              </div>
              <div className="rounded border border-[--steel-200] p-2">
                <p className="font-sans text-[10px] uppercase text-[--steel-600] mb-1">Final error</p>
                <p className={lastIKReport.success ? "text-[--safe-text]" : "text-red-700"}>
                  {lastIKReport.finalErrorMeters !== undefined ? `${(lastIKReport.finalErrorMeters * 1000).toFixed(2)} mm` : "-"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {lastIKReport.steps.map((step) => (
                <div key={step.label} className="rounded border border-[--steel-200] bg-[--panel] p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[11px] font-bold text-[--walnut-700] font-sans uppercase tracking-wide">{step.label}</p>
                    <span className="text-[10px] text-[--steel-600] font-mono">{lastIKReport.iterations} iters</span>
                  </div>
                  <p className="text-[11px] font-mono text-[--walnut-900] break-words">{step.equation}</p>
                  <p className="text-[11px] font-mono text-[--safe-text] mt-1 break-words">{step.output}</p>
                  <p className="text-[11px] text-[--steel-600] font-sans mt-1 leading-relaxed">{step.why}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
