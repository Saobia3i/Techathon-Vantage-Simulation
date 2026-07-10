"use client";

import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import { useRobotStore } from "@/state/robotStore";
import { moveTo } from "@/lib/moveTo";
import { useState } from "react";

// Simulated PIN-key voice command shortcuts (keep existing feature)
const VOICE_KEY_SHORTCUTS = [
  { label: "Move Up", command: "move up" },
  { label: "Move Down", command: "move down" },
  { label: "Move Left", command: "move left" },
  { label: "Move Right", command: "move right" },
  { label: "Move Forward", command: "move forward" },
  { label: "Move Backward", command: "move backward" },
];

export function VoiceControls({
  onStatusChange,
}: {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
}) {
  const { keyPositions } = useRobotStore();

  // Teammate's useVoiceCommand hook — handles SpeechRecognition + moveTo
  const { isListening, transcript, lastAction, startListening } = useVoiceCommand();

  // Simulated command buttons (our existing feature — tap to inject a voice command)
  const [simFeedback, setSimFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  const simulateCommand = (command: string) => {
    // Map natural language to key positions if "key N" is spoken
    const keyMatch = command.match(/key\s*(\d)/);
    if (keyMatch) {
      const pos = keyPositions[keyMatch[1]];
      if (!pos) {
        setSimFeedback({ msg: `No position for Key ${keyMatch[1]}`, ok: false });
        onStatusChange?.(`No position for Key ${keyMatch[1]}`, false);
        return;
      }
      const res = moveTo(pos);
      const msg = res.success
        ? `✓ Key ${keyMatch[1]} reached`
        : `Key ${keyMatch[1]} failed — ${res.reason}`;
      setSimFeedback({ msg, ok: res.success });
      onStatusChange?.(msg, res.success, res.reason);
      return;
    }

    // Natural language commands — delegate to the hook's same parser logic
    let { x, y, z } = { x: 0.12, y: 0.04, z: 0.3 };
    const step = 0.05;
    if (command.includes("move up")) z += step;
    else if (command.includes("move down")) z -= step;
    else if (command.includes("move left")) x -= step;
    else if (command.includes("move right")) x += step;
    else if (command.includes("move forward")) y += step;
    else if (command.includes("move backward")) y -= step;
    else {
      setSimFeedback({ msg: `Unrecognised: "${command}"`, ok: false });
      return;
    }

    const res = moveTo({ x, y, z });
    const msg = res.success
      ? `✓ "${command}" → (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`
      : `"${command}" blocked — ${res.reason}`;
    setSimFeedback({ msg, ok: res.success });
    onStatusChange?.(msg, res.success, res.reason);
  };

  const isHookSuccess = !lastAction.includes("failed") && !lastAction.includes("not recognized") && lastAction !== "None";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Voice control surface
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans mb-3">
          Say{" "}
          <em className="text-[--walnut-700] not-italic font-medium">
            "move up / down / left / right / forward / backward"
          </em>{" "}
          or click a quick command below.
        </p>
      </div>

      {/* Mic button — hooks into teammate's useVoiceCommand */}
      <div className="flex items-center gap-4">
        <button
          onClick={startListening}
          disabled={isListening}
          className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded text-sm font-semibold font-sans border cursor-pointer transition-all ${
            isListening
              ? "bg-red-600 border-red-600 text-white"
              : "bg-[--walnut-700] border-[--walnut-700] text-white hover:bg-[--walnut-900]"
          }`}
        >
          {isListening && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-400 animate-ping" />
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
          {isListening ? "Listening…" : "Speak Command"}
        </button>

        {transcript && (
          <span className="text-xs font-mono text-[--steel-600] truncate">
            &ldquo;{transcript}&rdquo;
          </span>
        )}
      </div>

      {/* Live status from hook */}
      {lastAction !== "None" && (
        <div
          className={`p-2.5 rounded text-xs border font-sans ${
            isHookSuccess
              ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {lastAction}
        </div>
      )}

      {/* Quick command buttons */}
      <div>
        <p className="text-[11px] font-bold text-[--steel-600] uppercase tracking-wider mb-2 font-sans">
          Quick Commands
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {VOICE_KEY_SHORTCUTS.map(({ label, command }) => (
            <button
              key={command}
              onClick={() => simulateCommand(command)}
              className="flex items-center gap-2 px-3 py-2 rounded border border-[--steel-200] bg-[--panel] hover:border-[--copper] hover:bg-white text-xs font-sans text-[--walnut-700] font-medium cursor-pointer transition-all active:scale-95 text-left"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-[--copper]">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <line x1="12" y1="18" x2="12" y2="22" />
              </svg>
              {label}
            </button>
          ))}
        </div>
      </div>

      {simFeedback && (
        <div className={`p-2.5 rounded text-xs border font-mono ${
          simFeedback.ok
            ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {simFeedback.msg}
        </div>
      )}
    </div>
  );
}
