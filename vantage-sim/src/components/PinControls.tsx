"use client";

import { useState } from "react";
import { moveTo } from "../lib/moveTo";
import { useRobotStore } from "../state/robotStore";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function PinControls() {
  const [pin, setPin] = useState("123456");
  const [isExecuting, setIsExecuting] = useState(false);
  const [status, setStatus] = useState("Ready for input");

  const executePin = async () => {
    if (!pin || isExecuting) return;

    const keyPositions = useRobotStore.getState().keyPositions;

    if (Object.keys(keyPositions).length === 0) {
      setStatus("Error: Key positions not loaded yet!");
      return;
    }

    setIsExecuting(true);
    setStatus("Starting autonomous sequence...");

    for (let i = 0; i < pin.length; i++) {
      const digit = pin[i];
      const targetPos = keyPositions[digit];

      if (!targetPos) {
        console.warn(`No coordinates found for digit: ${digit}`);
        continue;
      }

      setStatus(`Targeting digit: ${digit}`);

      // FIX: ডিরেকশন উল্টে দেওয়া হলো (-0.05)।
      // এখন রোবট ঠিকভাবে বাটনের সামনে ভাসবে, ভেতরের দিকে ঢুকে যাবে না!
      const hoverZ = targetPos.z - 0.05;

      // Step 1: Hover (বাটনের ঠিক সামনে আসবে)
      moveTo({ x: targetPos.x, y: targetPos.y, z: hoverZ });
      await delay(600);

      // Step 2: Press (সামনে এগিয়ে বাটন প্রেস করবে)
      setStatus(`Pressing digit: ${digit}`);
      moveTo({ x: targetPos.x, y: targetPos.y, z: targetPos.z });
      await delay(400);

      // Step 3: Hover back (প্রেস করে আবার পেছনে সরে আসবে)
      moveTo({ x: targetPos.x, y: targetPos.y, z: hoverZ });
      await delay(500);
    }

    setStatus("Sequence complete! Returning to home.");
    // কাজ শেষে নিরাপদ পজিশনে ফিরে আসবে
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
