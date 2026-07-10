"use client";

import { useState } from "react";
import { moveToSmooth as moveTo } from "@/lib/animateArm";
import { formatSafetyReason } from "@/lib/safetyMessages";
import { useRobotStore } from "@/state/robotStore";

type DashboardControlsProps = {
  onStatusChange?: (
    message: string,
    success: boolean,
    reason?: string
  ) => void;
};

const KEY_ACCENTS: Record<string, string> = {
  "1": "border-[#ff5f7a]",
  "2": "border-[#6adfd2]",
  "3": "border-[#86d7ff]",
  "4": "border-[#f2a85f]",
  "5": "border-[#c765f2]",
  "6": "border-[#f5e681]",
};

export function DashboardControls({ onStatusChange }: DashboardControlsProps) {
  const { keyPositions } = useRobotStore();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(true);

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

  const keys = Object.entries(keyPositions).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  return (
    <div className="space-y-6">
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
    </div>
  );
}
