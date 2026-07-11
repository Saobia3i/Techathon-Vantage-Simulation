"use client";

import { useState } from "react";
import { moveToSmooth as moveTo } from "@/lib/animateArm";
import { formatSafetyReason } from "@/lib/safetyMessages";
import { useRobotStore } from "@/state/robotStore";
import { checkCollision } from "@/lib/moveTo";

type DashboardControlsProps = {
  onStatusChange?: (
    message: string,
    success: boolean,
    reason?: string
  ) => void;
  isHUD?: boolean;
};

const KEY_ACCENTS: Record<string, string> = {
  "1": "border-[#ff5f7a]",
  "2": "border-[#6adfd2]",
  "3": "border-[#86d7ff]",
  "4": "border-[#f2a85f]",
  "5": "border-[#c765f2]",
  "6": "border-[#f5e681]",
};

export function DashboardControls({ onStatusChange, isHUD }: DashboardControlsProps) {
  const { robot, jointNames, keyPositions } = useRobotStore();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(true);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setDebugLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`].slice(-8));
    console.log(msg);
  };

  const handleKeyClick = (
    digit: string,
    pos: { x: number; y: number; z: number }
  ) => {
    const result = moveTo(pos);

    if (result.success) {
      const message = `Moving to key ${digit}`;
      setStatusMessage(message);
      setIsSuccess(true);
      onStatusChange?.(message, true);
      return;
    }

    const message = `Key ${digit} rejected: ${formatSafetyReason(
      result.reason
    )}`;
    setStatusMessage(message);
    setIsSuccess(false);
    onStatusChange?.(message, false, result.reason);
  };

  const nudgeJoint = (index: number, delta: number) => {
    addLog(`[nudge] Triggered index=${index}, delta=${delta}`);
    if (!robot) {
      addLog("Warning: Robot not loaded yet");
      return;
    }
    const name = jointNames[index];
    addLog(`Joint name: ${name}`);
    if (!name) {
      addLog("Warning: Joint name not found at index");
      return;
    }
    const joint = robot.joints[name];
    if (!joint) {
      addLog(`Warning: Joint object not found for ${name}`);
      return;
    }

    const stylusLinkName = useRobotStore.getState().stylusLinkName || "stylus_tip";
    const eeLink = robot.links[stylusLinkName];
    addLog(`eeLink "${stylusLinkName}": ${eeLink ? "found" : "NOT found"}`);
    if (!eeLink) {
      addLog(`Warning: End-effector link not found`);
      return;
    }

    const currentVal = (joint.angle as number) ?? 0;
    let targetVal = currentVal + delta;
    addLog(`Current value: ${currentVal.toFixed(3)}, target value: ${targetVal.toFixed(3)}`);

    // 1. Clamp to joint limits
    if (joint.jointType === "revolute" && joint.limit) {
      targetVal = Math.max(joint.limit.lower, Math.min(joint.limit.upper, targetVal));
      addLog(`Clamped target: ${targetVal.toFixed(3)}`);
    }

    if (Math.abs(targetVal - currentVal) < 1e-4) {
      const message = `Nudge blocked: ${name} is at its physical limit`;
      addLog(`Blocked: at physical limit`);
      setStatusMessage(message);
      setIsSuccess(false);
      onStatusChange?.(message, false, "limit_clamped");
      return;
    }

    try {
      // 2. Temporarily set joint value for collision check
      robot.setJointValue(name, targetVal);
      robot.updateMatrixWorld(true);

      // 3. Collision check
      const activeNames = jointNames.filter((n) => {
        const j = robot.joints[n];
        return j && (j.jointType === "revolute" || j.jointType === "continuous");
      });
      addLog("Running checkCollision...");
      const coll = checkCollision(robot, activeNames, eeLink);
      addLog(`Collision check result: ${JSON.stringify(coll)}`);

      if (coll.collision) {
        // Revert change
        robot.setJointValue(name, currentVal);
        robot.updateMatrixWorld(true);
        const message = `Nudge blocked: collision detected (${formatSafetyReason(coll.reason)})`;
        addLog(`Blocked: collision detected`);
        setStatusMessage(message);
        setIsSuccess(false);
        onStatusChange?.(message, false, coll.reason);
      } else {
        // Accept change and sync store state
        const angles = jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0);
        useRobotStore.getState().setCurrentAngles(angles);
        const message = `Nudged ${name} to ${targetVal.toFixed(2)} rad`;
        addLog(`Success: ${message}`);
        setStatusMessage(message);
        setIsSuccess(true);
        onStatusChange?.(message, true);
      }
    } catch (err: any) {
      addLog(`Error executing nudge: ${err?.message || String(err)}`);
      try {
        robot.setJointValue(name, currentVal);
        robot.updateMatrixWorld(true);
      } catch (revertErr) {
        addLog(`Revert failed: ${String(revertErr)}`);
      }
    }
  };

  const keys = Object.entries(keyPositions).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  if (isHUD) {
    return (
      <div className="rounded-lg bg-[--panel]/85 backdrop-blur-md border border-[--steel-400]/40 p-2.5 shadow-lg w-[230px] font-sans flex flex-col gap-2">
        <div className="border-b border-[--steel-400]/30 pb-1 flex items-center justify-between">
          <span className="font-bold tracking-wider text-[--walnut-700] uppercase text-[8px]">Targets & Nudges</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {/* Compact Key Target Panel */}
        <div>
          <span className="text-[8px] font-bold text-[--steel-600] uppercase tracking-wider block mb-1">Key Targets</span>
          <div className="grid grid-cols-6 gap-1">
            {keys.map(([digit, pos]) => (
              <button
                key={digit}
                className="h-6 rounded border border-[--steel-400]/30 bg-white/55 text-[9px] font-bold text-[--walnut-900] hover:bg-[--copper] hover:text-white transition cursor-pointer active:scale-90"
                onClick={() => handleKeyClick(digit, pos)}
                title={`Coords: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`}
              >
                K{digit}
              </button>
            ))}
          </div>
        </div>

        {/* Compact Direct Joint Nudges */}
        <div>
          <span className="text-[8px] font-bold text-[--steel-600] uppercase tracking-wider block mb-1">Joint Nudges</span>
          <div className="grid grid-cols-2 gap-1">
            {jointNames
              .filter((n) => n !== "stylus_joint")
              .map((name) => {
                const originalIndex = jointNames.indexOf(name);
                const displayLabel = {
                  joint1: "J1 base",
                  joint2: "J2 shoulder",
                  joint3: "J3 elbow",
                  joint4: "J4 wrist 1",
                  joint5: "J5 wrist 2",
                  joint6: "J6 wrist 3",
                }[name] || name;
                const shortLabel = name.replace("joint", "J");

                return (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded border border-[--steel-200]/70 bg-white/40 px-1.5 py-1"
                  >
                    <span className="font-mono text-[9px] font-bold text-[--walnut-700]" title={displayLabel}>
                      {shortLabel}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => nudgeJoint(originalIndex, -0.15)}
                        className="w-5 h-5 rounded border border-[--steel-400]/20 bg-[--steel-200] text-[--walnut-900] font-bold hover:bg-[--copper] hover:text-white transition-colors cursor-pointer text-[9px] flex items-center justify-center active:scale-90"
                      >
                        &minus;
                      </button>
                      <button
                        onClick={() => nudgeJoint(originalIndex, 0.15)}
                        className="w-5 h-5 rounded border border-[--steel-400]/20 bg-[--steel-200] text-[--walnut-900] font-bold hover:bg-[--copper] hover:text-white transition-colors cursor-pointer text-[9px] flex items-center justify-center active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Compact status text */}
        {statusMessage && (
          <div className={`mt-0.5 px-2 py-0.5 rounded border text-[8px] font-mono leading-tight truncate ${
            isSuccess ? "bg-[--safe-bg] border-[--safe-text]/20 text-[--safe-text]" : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {statusMessage}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Key Target Panel ────────────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-[--walnut-900]">
          Key Target Panel
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {keys.map(([digit, pos]) => (
            <button
              key={digit}
              className={`rounded border-2 bg-white/55 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md ${
                KEY_ACCENTS[digit] ?? "border-[--steel-400]"
              }`}
              onClick={() => handleKeyClick(digit, pos)}
            >
              <div className="font-mono text-sm font-bold text-[--walnut-900]">
                Key {digit}
              </div>
              <div className="mt-2 font-mono text-xs text-[--walnut-700]">
                {pos.x.toFixed(2)}, {pos.y.toFixed(2)}, {pos.z.toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Direct Joint Nudges ────────────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-[--walnut-900]">
          Direct Joint Nudges
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          {jointNames
            .filter((n) => n !== "stylus_joint")
            .map((name) => {
              const originalIndex = jointNames.indexOf(name);
              const displayLabel = {
                joint1: "J1 base",
                joint2: "J2 shoulder",
                joint3: "J3 elbow",
                joint4: "J4 wrist 1",
                joint5: "J5 wrist 2",
                joint6: "J6 wrist 3",
              }[name] || name;

              return (
                <div
                  key={name}
                  className="flex flex-col justify-between rounded border border-[--steel-200] bg-white/55 p-2.5 shadow-sm hover:bg-white transition"
                >
                  <span className="font-mono text-[10px] font-bold text-[--walnut-700] text-center mb-2 truncate" title={displayLabel}>
                    {displayLabel}
                  </span>
                  <div className="flex gap-1.5 justify-center">
                    <button
                      onClick={() => nudgeJoint(originalIndex, -0.15)}
                      className="flex-1 h-7 rounded border border-[--steel-400]/40 bg-[--steel-200] text-[--walnut-900] font-black hover:bg-[--copper] hover:text-white transition-colors cursor-pointer text-xs flex items-center justify-center active:scale-95"
                    >
                      &minus;
                    </button>
                    <button
                      onClick={() => nudgeJoint(originalIndex, 0.15)}
                      className="flex-1 h-7 rounded border border-[--steel-400]/40 bg-[--steel-200] text-[--walnut-900] font-black hover:bg-[--copper] hover:text-white transition-colors cursor-pointer text-xs flex items-center justify-center active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {statusMessage && (
        <div
          className={`rounded border px-3 py-2 text-sm font-semibold ${
            isSuccess
              ? "border-emerald-400 bg-emerald-50 text-emerald-800"
              : "border-red-400 bg-red-50 text-red-800"
          }`}
        >
          {statusMessage}
        </div>
      )}

      {/* ── Debug Log Panel ────────────────────────────────────────── */}
      {debugLogs.length > 0 && (
        <div className="rounded border border-[--steel-200] bg-white/70 p-2.5 shadow-sm">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[--steel-600]">Nudge Debug Logs</span>
            <button onClick={() => setDebugLogs([])} className="text-[9px] font-bold text-red-600 hover:text-red-800 cursor-pointer">Clear</button>
          </div>
          <pre className="text-[9px] font-mono text-slate-700 bg-slate-50 border border-slate-200/50 p-1.5 rounded max-h-[100px] overflow-y-auto whitespace-pre-wrap leading-tight">
            {debugLogs.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
