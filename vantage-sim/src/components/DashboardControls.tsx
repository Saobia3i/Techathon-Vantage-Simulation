"use client";

import { useRobotStore } from "@/state/robotStore";
import { moveToSmooth as moveTo } from "@/lib/animateArm";
import { checkCollision } from "@/lib/moveTo";
import { useState } from "react";

export function DashboardControls({
  onStatusChange,
}: {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
}) {
  const { robot, jointNames, keyPositions } = useRobotStore();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(true);

  const handleKeyClick = (digit: string, pos: { x: number; y: number; z: number }) => {
    setStatusMessage(`Moving to Key ${digit}...`);
    onStatusChange?.(`Moving to Key ${digit}...`, true);

    // Call the moveTo API contract
    const result = moveTo(pos);

    if (result.success) {
      setIsSuccess(true);
      const msg = `Reached Key ${digit} (x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)})`;
      setStatusMessage(msg);
      onStatusChange?.(msg, true);
    } else {
      setIsSuccess(false);
      const msg = `Failed: ${result.reason || "unknown error"}`;
      setStatusMessage(msg);
      onStatusChange?.(msg, false, result.reason);
    }
  };

  // nudgeJoint modifies the joint angle directly in joint-space, clamping to URDF limits
  // and performing a collision check on the resulting state before accepting.
  const nudgeJoint = (index: number, delta: number) => {
    if (!robot) return;
    const name = jointNames[index];
    const joint = robot.joints[name];
    if (!joint) return;

    const stylusLinkName = useRobotStore.getState().stylusLinkName || "stylus_tip";
    const eeLink = robot.links[stylusLinkName];
    if (!eeLink) return;

    const currentVal = (joint.angle as number) ?? 0;
    let targetVal = currentVal + delta;

    // 1. Clamp to joint limits
    if (joint.jointType === "revolute" && joint.limit) {
      targetVal = Math.max(joint.limit.lower, Math.min(joint.limit.upper, targetVal));
    }

    if (Math.abs(targetVal - currentVal) < 1e-4) {
      onStatusChange?.(`Nudge blocked: ${name} is at its physical limit`, false, "limit_clamped");
      return;
    }

    // 2. Temporarily set joint value for collision check
    robot.setJointValue(name, targetVal);
    robot.updateMatrixWorld(true);

    // 3. Collision check
    const activeNames = jointNames.filter((n) => {
      const j = robot.joints[n];
      return j && (j.jointType === "revolute" || j.jointType === "continuous");
    });
    const coll = checkCollision(robot, activeNames, eeLink);

    if (coll.collision) {
      // Revert change
      robot.setJointValue(name, currentVal);
      robot.updateMatrixWorld(true);
      onStatusChange?.(`Nudge blocked: collision detected (${coll.reason})`, false, coll.reason);
    } else {
      // Accept change and sync store state
      const angles = jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0);
      useRobotStore.getState().setCurrentAngles(angles);
      onStatusChange?.(`Nudged ${name} to ${targetVal.toFixed(2)} rad`, true);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Key Target Panel ────────────────────────────────────────── */}
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-3">
          Key Target Panel
        </p>
        {Object.keys(keyPositions).length === 0 ? (
          <p className="text-xs text-[--steel-600] italic">Loading targets...</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(keyPositions).map(([digit, pos]) => {
              const accentColor = {
                "1": "border-[#ff4d6d]",
                "2": "border-[#ff8c42]",
                "3": "border-[#ffe14d]",
                "4": "border-[#4dffb8]",
                "5": "border-[#4dc3ff]",
                "6": "border-[#b44dff]",
              }[digit] || "border-[--steel-400]";

              return (
                <button
                  key={digit}
                  onClick={() => handleKeyClick(digit, pos)}
                  className={`flex flex-col p-2.5 rounded border-l-4 border-y border-r border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white active:scale-95 transition-all text-left cursor-pointer`}
                  title={`Coords: x=${pos.x.toFixed(3)}, y=${pos.y.toFixed(3)}, z=${pos.z.toFixed(3)}`}
                >
                  <span className="text-xs font-semibold text-[--walnut-900] font-sans">
                    Key {digit}
                  </span>
                  <span className="text-[10px] text-[--steel-600] font-mono mt-1">
                    {pos.x.toFixed(2)}, {pos.z.toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Joint Nudges ────────────────────────────────────────────── */}
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-3">
          Direct Joint Nudges
        </p>
        <div className="grid grid-cols-2 gap-2">
          {jointNames
            .filter((n) => n !== "stylus_joint")
            .map((name, i) => {
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
                  className="flex items-center justify-between p-2 rounded border border-[--steel-200] bg-[--panel]"
                >
                  <span className="text-xs font-mono text-[--steel-600] font-medium">
                    {displayLabel}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => nudgeJoint(i, -0.15)}
                      className="w-6 h-6 rounded bg-[--steel-200] text-[--walnut-900] font-bold hover:bg-[--copper] hover:text-white transition-colors cursor-pointer text-xs flex items-center justify-center active:scale-90"
                    >
                      &minus;
                    </button>
                    <button
                      onClick={() => nudgeJoint(i, 0.15)}
                      className="w-6 h-6 rounded bg-[--steel-200] text-[--walnut-900] font-bold hover:bg-[--copper] hover:text-white transition-colors cursor-pointer text-xs flex items-center justify-center active:scale-90"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* ── Feedback Message ────────────────────────────────────────── */}
      {statusMessage && (
        <div
          className={`p-3 rounded text-xs border font-sans ${
            isSuccess
              ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
}
