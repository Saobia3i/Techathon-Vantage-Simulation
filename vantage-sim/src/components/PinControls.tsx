"use client";

import { useState } from "react";
import { moveToSmooth as moveTo } from "../lib/animateArm";
import { useRobotStore } from "../state/robotStore";

// TypeScript-এর জন্য Props ডিফাইন করা হলো (যাতে page.tsx থেকে আসা ডেটা রিসিভ করতে পারে)
interface PinControlsProps {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function PinControls({ onStatusChange }: PinControlsProps) {
  const [pin, setPin] = useState("123456");
  const [isExecuting, setIsExecuting] = useState(false);
  const [status, setStatus] = useState("Ready for input");

  const updateStatus = (msg: string) => {
    setStatus(msg);
    if (onStatusChange) {
      onStatusChange(msg, true);
    }
  };

  const executePin = async () => {
    if (!pin || isExecuting) return;

    const keyPositions = useRobotStore.getState().keyPositions;

    if (Object.keys(keyPositions).length === 0) {
      const errorMsg = "Error: Key positions not loaded yet!";
      setStatus(errorMsg);
      if (onStatusChange) onStatusChange(errorMsg, false, "No positions");
      return;
    }

    setIsExecuting(true);
    updateStatus("Starting autonomous sequence...");

    for (let i = 0; i < pin.length; i++) {
      const digit = pin[i];
      const targetPos = keyPositions[digit];

      if (!targetPos) {
        console.warn(`No coordinates found for digit: ${digit}`);
        continue;
      }

      updateStatus(`Targeting digit: ${digit}`);
      const hoverZ = targetPos.z - 0.05;

      moveTo({ x: targetPos.x, y: targetPos.y, z: hoverZ });
      await delay(700); // wait for smooth animation to settle before pressing

      updateStatus(`Pressing digit: ${digit}`);
      moveTo({ x: targetPos.x, y: targetPos.y, z: targetPos.z });
      await delay(500); // dwell time — arm touches key

      moveTo({ x: targetPos.x, y: targetPos.y, z: hoverZ });
      await delay(600); // retract before next key
    }

    updateStatus("Sequence complete! Returning to home.");
    moveTo({ x: 0.12, y: 0.25, z: 0.15 });

    setIsExecuting(false);
  };

  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm">
      <h3 className="font-bold text-gray-800 mb-4">Autonomous PIN Entry 🤖</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Enter PIN (1-6 only)
          </label>
          <input
            type="text"
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/[^1-6]/g, "").slice(0, 6))
            }
            disabled={isExecuting}
            className="w-full border border-gray-300 rounded-md shadow-sm p-2"
            placeholder="e.g. 123456"
          />
        </div>
        <button
          onClick={executePin}
          disabled={isExecuting || pin.length === 0}
          className={`w-full py-2 px-4 rounded-md text-white font-medium ${
            isExecuting ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isExecuting ? "Executing..." : "Submit PIN"}
        </button>
        <div className="mt-4 p-3 bg-slate-50 border rounded-md">
          <p className="text-sm text-slate-600 font-mono">
            <strong>Status:</strong> {status}
          </p>
        </div>
      </div>
    </div>
  );
}
