"use client";

import { useRobotStore } from "@/state/robotStore";
import { moveTo } from "@/lib/moveTo";
import { useState, useRef } from "react";

const DIGIT_COLORS: Record<string, string> = {
  "1": "bg-[#ff4d6d] text-white",
  "2": "bg-[#ff8c42] text-white",
  "3": "bg-[#ffe14d] text-[--walnut-900]",
  "4": "bg-[#4dffb8] text-[--walnut-900]",
  "5": "bg-[#4dc3ff] text-white",
  "6": "bg-[#b44dff] text-white",
};

type SequenceStep = {
  digit: string;
  status: "pending" | "running" | "success" | "failed";
  reason?: string;
};

export function PinControls({
  onStatusChange,
}: {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
}) {
  const { keyPositions } = useRobotStore();
  const [pin, setPin] = useState<string[]>([]);
  const [sequence, setSequence] = useState<SequenceStep[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);

  const addDigit = (digit: string) => {
    if (pin.length >= 8) return;
    setPin((prev) => [...prev, digit]);
  };

  const clearPin = () => {
    if (running) return;
    setPin([]);
    setSequence([]);
  };

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const executeSequence = async () => {
    if (pin.length === 0 || running) return;

    abortRef.current = false;
    setRunning(true);
    onStatusChange?.(`Executing PIN sequence: ${pin.join("-")}`, true);

    const steps: SequenceStep[] = pin.map((d) => ({ digit: d, status: "pending" }));
    setSequence([...steps]);

    for (let i = 0; i < steps.length; i++) {
      if (abortRef.current) break;

      const digit = steps[i].digit;
      const pos = keyPositions[digit];

      // Mark as running
      steps[i] = { ...steps[i], status: "running" };
      setSequence([...steps]);

      if (!pos) {
        steps[i] = { ...steps[i], status: "failed", reason: "no position" };
        setSequence([...steps]);
        onStatusChange?.(`PIN Step ${i + 1}: Key ${digit} — no position config`, false);
        await delay(300);
        continue;
      }

      onStatusChange?.(`PIN Step ${i + 1}/${steps.length}: Approaching Key ${digit}…`, true);

      const result = moveTo(pos);
      await delay(150); // brief pause for animation to visually settle

      if (result.success) {
        steps[i] = { ...steps[i], status: "success" };
        setSequence([...steps]);
        onStatusChange?.(`PIN Step ${i + 1}: Key ${digit} reached ✓`, true);
        await delay(700); // "touch hold" dwell time
      } else {
        steps[i] = { ...steps[i], status: "failed", reason: result.reason };
        setSequence([...steps]);
        onStatusChange?.(`PIN Step ${i + 1}: Key ${digit} failed — ${result.reason}`, false, result.reason);
        await delay(400);
      }
    }

    setRunning(false);
    onStatusChange?.("PIN sequence complete.", true);
  };

  const abort = () => {
    abortRef.current = true;
    setRunning(false);
  };

  const stepStatusStyle = (status: SequenceStep["status"]) => {
    if (status === "running") return "border-[--copper] bg-[--copper]/10 text-[--walnut-900]";
    if (status === "success") return "border-[--safe-text] bg-[--safe-bg] text-[--safe-text]";
    if (status === "failed") return "border-red-400 bg-red-50 text-red-700";
    return "border-[--steel-200] bg-[--panel] text-[--steel-600]";
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Autonomous PIN Sequencer
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans mb-3">
          Enter a digit sequence (1–6), then execute. The arm touches each key in order with ±5 mm tolerance.
        </p>
      </div>

      {/* PIN display */}
      <div className="flex items-center gap-1.5 flex-wrap min-h-[36px] p-2 bg-[--steel-100] rounded border border-[--steel-200]">
        {pin.length === 0 ? (
          <span className="text-xs text-[--steel-400] font-mono italic">Enter PIN digits…</span>
        ) : (
          pin.map((d, i) => (
            <span
              key={i}
              className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold font-mono ${DIGIT_COLORS[d] || "bg-[--walnut-500] text-white"}`}
            >
              {d}
            </span>
          ))
        )}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6"].map((d) => (
          <button
            key={d}
            onClick={() => addDigit(d)}
            disabled={running}
            className={`h-9 rounded font-bold text-sm cursor-pointer border transition-all active:scale-95 ${DIGIT_COLORS[d]} border-transparent hover:opacity-90 disabled:opacity-40`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={clearPin}
          disabled={running}
          className="flex-1 py-2 rounded border border-[--steel-400] bg-[--panel] text-[--walnut-700] text-xs font-semibold font-sans hover:bg-[--steel-200] cursor-pointer disabled:opacity-40 transition-colors"
        >
          Clear
        </button>
        {running ? (
          <button
            onClick={abort}
            className="flex-1 py-2 rounded bg-red-600 border-red-600 text-white text-xs font-semibold font-sans cursor-pointer hover:bg-red-700 transition-colors"
          >
            Abort
          </button>
        ) : (
          <button
            onClick={executeSequence}
            disabled={pin.length === 0}
            className="flex-1 py-2 rounded bg-[--walnut-700] border-[--walnut-700] text-white text-xs font-semibold font-sans cursor-pointer hover:bg-[--walnut-900] disabled:opacity-40 transition-colors"
          >
            Execute PIN
          </button>
        )}
      </div>

      {/* Sequence status */}
      {sequence.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans mb-1">
            Execution log
          </p>
          {sequence.map((step, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs font-sans transition-all ${stepStatusStyle(step.status)}`}
            >
              <span
                className={`w-5 h-5 rounded-full font-bold text-[10px] flex items-center justify-center shrink-0 ${DIGIT_COLORS[step.digit] || "bg-[--walnut-500] text-white"}`}
              >
                {step.digit}
              </span>
              <span>
                {step.status === "running" && "Approaching…"}
                {step.status === "success" && "Touched ✓"}
                {step.status === "failed" && `Failed — ${step.reason}`}
                {step.status === "pending" && "Pending"}
              </span>
              {step.status === "running" && (
                <span className="ml-auto w-2 h-2 rounded-full bg-[--copper] animate-ping" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
