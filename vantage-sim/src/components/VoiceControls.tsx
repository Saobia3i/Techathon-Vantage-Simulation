"use client";

import { useRobotStore } from "@/state/robotStore";
import { moveTo } from "@/lib/moveTo";
import { useState } from "react";

const VOICE_COMMANDS = [
  { label: "Move to Key 1", action: "key1" },
  { label: "Move to Key 2", action: "key2" },
  { label: "Move to Key 3", action: "key3" },
  { label: "Move to Key 4", action: "key4" },
  { label: "Move to Key 5", action: "key5" },
  { label: "Move to Key 6", action: "key6" },
];

export function VoiceControls({
  onStatusChange,
}: {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
}) {
  const { keyPositions } = useRobotStore();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(true);

  const executeCommand = (action: string) => {
    const digit = action.replace("key", "");
    const pos = keyPositions[digit];
    if (!pos) {
      const msg = `No position found for Key ${digit}`;
      setFeedback(msg);
      setIsSuccess(false);
      onStatusChange?.(msg, false);
      return;
    }
    const res = moveTo(pos);
    if (res.success) {
      setIsSuccess(true);
      const msg = `✓ Voice: Reached Key ${digit} at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`;
      setFeedback(msg);
      onStatusChange?.(msg, true);
    } else {
      setIsSuccess(false);
      const msg = `Voice: Failed Key ${digit} — ${res.reason}`;
      setFeedback(msg);
      onStatusChange?.(msg, false, res.reason);
    }
  };

  const toggleListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setTranscript("[Browser does not support Web Speech API — use the command cards below]");
      return;
    }

    if (listening) {
      setListening(false);
      return;
    }

    setListening(true);
    setTranscript("Listening...");

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const said = event.results[0][0].transcript.toLowerCase();
      setTranscript(`"${said}"`);
      setListening(false);

      // Parse spoken command
      const match = said.match(/key\s*(\d)/);
      if (match) {
        executeCommand(`key${match[1]}`);
      } else {
        setFeedback(`Unrecognised command: "${said}"`);
        setIsSuccess(false);
      }
    };

    recognition.onerror = () => {
      setListening(false);
      setTranscript("[Recognition error — try again or use the command cards]");
    };

    recognition.onend = () => setListening(false);
    recognition.start();
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Voice control surface
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans mb-3">
          Say "move to key 1…6" or click a command card. All commands route through{" "}
          <code className="font-mono text-[--walnut-700]">moveTo()</code>.
        </p>
      </div>

      {/* Mic button */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleListening}
          className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded text-sm font-semibold font-sans border cursor-pointer transition-all ${
            listening
              ? "bg-red-600 border-red-600 text-white"
              : "bg-[--walnut-700] border-[--walnut-700] text-white hover:bg-[--walnut-900]"
          }`}
        >
          {listening && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-400 animate-ping" />
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
          {listening ? "Listening…" : "Speak Command"}
        </button>
        {transcript && (
          <span className="text-xs font-mono text-[--steel-600] truncate">{transcript}</span>
        )}
      </div>

      {/* Command cards */}
      <div>
        <p className="text-[11px] font-bold text-[--steel-600] uppercase tracking-wider mb-2 font-sans">
          Simulated Commands
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {VOICE_COMMANDS.map(({ label, action }) => (
            <button
              key={action}
              onClick={() => { setTranscript(`"${label.toLowerCase()}"`); executeCommand(action); }}
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

      {feedback && (
        <div className={`p-2.5 rounded text-xs border font-sans ${
          isSuccess ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]" : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {feedback}
        </div>
      )}
    </div>
  );
}
