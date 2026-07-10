"use client";

import { useRobotStore } from "@/state/robotStore";
import { moveTo } from "@/lib/moveTo";
import * as THREE from "three";
import { useState } from "react";

export function JoystickControls({
  onStatusChange,
}: {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
}) {
  const { robot, stylusLinkName } = useRobotStore();
  const [stepSize, setStepSize] = useState<number>(0.02); // 2cm steps
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(true);

  const getEePos = (): THREE.Vector3 | null => {
    if (!robot || !stylusLinkName) return null;
    const link = robot.links[stylusLinkName];
    if (!link) return null;
    const v = new THREE.Vector3();
    link.getWorldPosition(v);
    return robot.worldToLocal(v);
  };

  const handleNudge = (axis: "x" | "y" | "z", dir: number) => {
    const curPos = getEePos();
    if (!curPos) {
      setFeedback("Failed: Robot or EE link not loaded");
      setIsSuccess(false);
      return;
    }

    const delta = stepSize * dir;
    const target = {
      x: curPos.x + (axis === "x" ? delta : 0),
      y: curPos.y + (axis === "y" ? delta : 0),
      z: curPos.z + (axis === "z" ? delta : 0),
    };

    const res = moveTo(target);
    if (res.success) {
      setIsSuccess(true);
      const msg = `Nudged EE ${axis.toUpperCase()} by ${(delta * 100).toFixed(1)} cm. Target reached.`;
      setFeedback(msg);
      onStatusChange?.(msg, true);
    } else {
      setIsSuccess(false);
      const msg = `Nudge failed: ${res.reason || "unreachable target"}`;
      setFeedback(msg);
      onStatusChange?.(msg, false, res.reason);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Joystick control surface
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans mb-3">
          Step-by-step cartesian translation in base coordinate frame.
        </p>
      </div>

      {/* Step Size Selector */}
      <div className="flex items-center gap-3 bg-[--panel] p-2 rounded border border-[--steel-200]">
        <span className="text-xs font-sans font-medium text-[--steel-600]">
          Step Size:
        </span>
        <div className="flex gap-1.5">
          {[0.01, 0.02, 0.05].map((size) => (
            <button
              key={size}
              onClick={() => setStepSize(size)}
              className={`px-2 py-0.5 text-xs font-mono rounded border cursor-pointer ${
                stepSize === size
                  ? "bg-[--walnut-700] text-white border-[--walnut-700]"
                  : "bg-white text-[--walnut-900] border-[--steel-400] hover:border-[--copper]"
              }`}
            >
              {(size * 100).toFixed(0)}cm
            </button>
          ))}
        </div>
      </div>

      {/* Control D-Pads */}
      <div className="grid grid-cols-2 gap-4">
        {/* XY Planar translation (D-Pad style) */}
        <div className="flex flex-col items-center p-3 bg-[--panel] rounded border border-[--steel-200] relative">
          <span className="text-[10px] font-bold text-[--steel-600] mb-2 uppercase font-sans">
            XY translation
          </span>
          <div className="w-24 h-24 relative flex items-center justify-center">
            {/* Y+ (Forward) */}
            <button
              onClick={() => handleNudge("y", 1)}
              className="absolute top-0 w-8 h-8 rounded bg-white hover:bg-[--copper] hover:text-white border border-[--steel-400] text-sm font-bold flex items-center justify-center cursor-pointer shadow-sm active:scale-90 transition-all"
              title="Move Forward (+Y)"
            >
              &uarr;
            </button>
            {/* X- (Left) */}
            <button
              onClick={() => handleNudge("x", -1)}
              className="absolute left-0 w-8 h-8 rounded bg-white hover:bg-[--copper] hover:text-white border border-[--steel-400] text-sm font-bold flex items-center justify-center cursor-pointer shadow-sm active:scale-90 transition-all"
              title="Move Left (-X)"
            >
              &larr;
            </button>
            {/* Center anchor */}
            <div className="w-4 h-4 rounded-full bg-[--walnut-500]/50" />
            {/* X+ (Right) */}
            <button
              onClick={() => handleNudge("x", 1)}
              className="absolute right-0 w-8 h-8 rounded bg-white hover:bg-[--copper] hover:text-white border border-[--steel-400] text-sm font-bold flex items-center justify-center cursor-pointer shadow-sm active:scale-90 transition-all"
              title="Move Right (+X)"
            >
              &rarr;
            </button>
            {/* Y- (Back) */}
            <button
              onClick={() => handleNudge("y", -1)}
              className="absolute bottom-0 w-8 h-8 rounded bg-white hover:bg-[--copper] hover:text-white border border-[--steel-400] text-sm font-bold flex items-center justify-center cursor-pointer shadow-sm active:scale-90 transition-all"
              title="Move Back (-Y)"
            >
              &darr;
            </button>
          </div>
        </div>

        {/* Z vertical translation */}
        <div className="flex flex-col items-center p-3 bg-[--panel] rounded border border-[--steel-200]">
          <span className="text-[10px] font-bold text-[--steel-600] mb-4 uppercase font-sans">
            Z translation
          </span>
          <div className="flex flex-col gap-2 w-14">
            <button
              onClick={() => handleNudge("z", 1)}
              className="w-14 py-2 rounded bg-white hover:bg-[--copper] hover:text-white border border-[--steel-400] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-90 transition-all"
              title="Move Up (+Z)"
            >
              Up &uarr;
            </button>
            <button
              onClick={() => handleNudge("z", -1)}
              className="w-14 py-2 rounded bg-white hover:bg-[--copper] hover:text-white border border-[--steel-400] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-90 transition-all"
              title="Move Down (-Z)"
            >
              Down &darr;
            </button>
          </div>
        </div>
      </div>

      {/* Telemetry log feedback */}
      {feedback && (
        <div
          className={`p-2.5 rounded text-xs border font-sans ${
            isSuccess
              ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {feedback}
        </div>
      )}
    </div>
  );
}
