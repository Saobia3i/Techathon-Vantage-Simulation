"use client";

import { useRef, useState } from "react";
import * as THREE from "three";
import { useRobotStore } from "@/state/robotStore";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import { moveToSmooth as moveTo } from "@/lib/animateArm";
import { chooseBestVoiceTranscript, describeVoiceCorrection, getSpeechAlternatives, normalizeVoiceText } from "@/lib/voiceGrammar";
import { formatSafetyReason } from "@/lib/safetyMessages";

type VoiceAction =
  | { type: "move_delta"; dx?: number; dy?: number; dz?: number }
  | { type: "move_absolute"; x: number; y: number; z: number }
  | { type: "move_to_key"; digit: string }
  | { type: "rotate_base"; degrees: number }
  | { type: "clarify"; question: string }
  | { type: "reject"; reason: string };

type AgenticResponse = {
  confirmation: string;
  actions: VoiceAction[];
};

type Props = {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
};

const primaryButtonStyle = {
  backgroundColor: "var(--walnut-700)",
  borderColor: "var(--walnut-700)",
  color: "#ffffff",
};

const disabledButtonStyle = {
  backgroundColor: "var(--steel-200)",
  borderColor: "var(--steel-400)",
  color: "var(--steel-600)",
};

function getEeWorldPosition() {
  const { robot, stylusLinkName } = useRobotStore.getState();
  if (!robot || !stylusLinkName) return null;
  const link = robot.links[stylusLinkName];
  if (!link) return null;
  const v = new THREE.Vector3();
  link.getWorldPosition(v);
  return { x: v.x, y: v.y, z: v.z };
}

function rotatePointAroundWorldY(pos: { x: number; y: number; z: number }, degrees: number) {
  const rad = THREE.MathUtils.degToRad(degrees);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: pos.x * cos - pos.z * sin,
    y: pos.y,
    z: pos.x * sin + pos.z * cos,
  };
}

export default function VoiceControlPanel({ onStatusChange }: Props) {
  const { keyPositions } = useRobotStore();
  const { isListening, transcript, lastAction, startListening } = useVoiceCommand(onStatusChange);
  const [agentInput, setAgentInput] = useState("");
  const [agentTranscript, setAgentTranscript] = useState("");
  const [agentStatus, setAgentStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentListening, setAgentListening] = useState(false);
  const agentRecognitionRef = useRef<any>(null);

  const executeAction = (action: VoiceAction): { ok: boolean; message: string; reason?: string } => {
    const cur = getEeWorldPosition();

    if (action.type === "clarify") {
      return { ok: false, message: action.question, reason: "clarification_needed" };
    }

    if (action.type === "reject") {
      return { ok: false, message: action.reason, reason: "agent_rejected" };
    }

    if (!cur) {
      return { ok: false, message: "Robot is not loaded yet.", reason: "robot_not_loaded" };
    }

    let target: { x: number; y: number; z: number };
    if (action.type === "move_delta") {
      target = {
        x: cur.x + (action.dx ?? 0),
        y: cur.y + (action.dy ?? 0),
        z: cur.z + (action.dz ?? 0),
      };
    } else if (action.type === "move_absolute") {
      target = { x: action.x, y: action.y, z: action.z };
    } else if (action.type === "move_to_key") {
      const keyTarget = keyPositions[action.digit];
      if (!keyTarget) return { ok: false, message: `Key ${action.digit} is not loaded.`, reason: "key_not_loaded" };
      target = keyTarget;
    } else {
      target = rotatePointAroundWorldY(cur, action.degrees);
    }

    const result = moveTo(target);
    return result.success
      ? { ok: true, message: `Moved to (${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)})` }
      : { ok: false, message: formatSafetyReason(result.reason), reason: result.reason };
  };

  const runAgenticCommand = async (instruction: string) => {
    const trimmed = normalizeVoiceText(instruction);
    if (!trimmed || agentBusy) return;

    setAgentBusy(true);
    setAgentStatus({ ok: true, message: "Groq is interpreting the command..." });

    try {
      const res = await fetch("/api/agentic-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: trimmed,
          currentPosition: getEeWorldPosition(),
          availableKeys: Object.keys(keyPositions),
        }),
      });
      const parsed = (await res.json()) as AgenticResponse;
      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];

      for (const action of actions) {
        const outcome = executeAction(action);
        if (!outcome.ok) {
          const msg = `${parsed.confirmation} ${outcome.message}`;
          setAgentStatus({ ok: false, message: msg });
          onStatusChange?.(msg, false, outcome.reason);
          return;
        }
      }

      const msg = `${parsed.confirmation} ${actions.length} action(s) executed through moveTo.`;
      setAgentStatus({ ok: true, message: msg });
      onStatusChange?.(msg, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Agentic voice failed.";
      setAgentStatus({ ok: false, message: msg });
      onStatusChange?.(msg, false, "agentic_voice_failed");
    } finally {
      setAgentBusy(false);
    }
  };

  const startAgenticListening = () => {
    if (agentBusy || agentListening) return;
    if (typeof window === "undefined") return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAgentStatus({ ok: false, message: "Speech recognition is not supported in this browser." });
      return;
    }

    const recognition = new SpeechRecognition();
    agentRecognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setAgentListening(true);
      setAgentTranscript("");
      setAgentStatus({ ok: true, message: "Listening for an agentic command..." });
    };

    recognition.onresult = (event: any) => {
      const alternatives = getSpeechAlternatives(event);
      const spokenText = chooseBestVoiceTranscript(alternatives);
      const rawText = alternatives[0]?.transcript ?? spokenText;
      setAgentTranscript(describeVoiceCorrection(rawText, spokenText));
      void runAgenticCommand(spokenText);
    };

    recognition.onerror = () => {
      setAgentStatus({ ok: false, message: "Agentic speech capture failed." });
      setAgentListening(false);
    };

    recognition.onend = () => setAgentListening(false);
    recognition.start();
  };

  const deterministicDisabled = isListening;
  const agentMicDisabled = agentBusy || agentListening;
  const typedDisabled = agentBusy || !agentInput.trim();

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Voice Control
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans">
          Local speech handles fixed commands. Agentic speech sends the spoken instruction directly to Groq and executes only safe structured actions.
        </p>
      </div>

      <div className="rounded border border-[--steel-400] p-3 space-y-3">
        <p className="text-[11px] font-bold text-[--walnut-700] uppercase tracking-wider font-sans">
          Deterministic Speech
        </p>
        <button
          onClick={startListening}
          disabled={deterministicDisabled}
          className="w-full px-4 py-2 rounded font-semibold text-sm border transition-colors"
          style={deterministicDisabled ? { backgroundColor: "#B91C1C", borderColor: "#B91C1C", color: "#ffffff" } : primaryButtonStyle}
        >
          {isListening ? "Listening..." : "Speak Deterministic Command"}
        </button>
        <div className="text-xs text-[--steel-600] space-y-1">
          <p><span className="font-semibold text-[--walnut-700]">You said:</span> {transcript || "..."}</p>
          <p><span className="font-semibold text-[--walnut-700]">Action:</span> {lastAction}</p>
        </div>
      </div>

      <div className="rounded border border-[--steel-400] p-3 space-y-3">
        <p className="text-[11px] font-bold text-[--walnut-700] uppercase tracking-wider font-sans">
          Phase 3B Agentic Voice
        </p>
        <button
          onClick={startAgenticListening}
          disabled={agentMicDisabled}
          className="w-full px-4 py-2 rounded font-semibold text-sm border transition-colors"
          style={agentMicDisabled ? disabledButtonStyle : primaryButtonStyle}
        >
          {agentListening ? "Listening..." : agentBusy ? "Thinking..." : "Speak Agentic Command"}
        </button>
        <div className="text-xs text-[--steel-600]">
          <span className="font-semibold text-[--walnut-700]">Agent heard:</span> {agentTranscript || "..."}
        </div>

        <textarea
          value={agentInput}
          onChange={(e) => setAgentInput(e.target.value)}
          placeholder='Optional typed fallback: "move to key 4 then move up a little"'
          rows={3}
          className="w-full rounded border border-[--steel-400] bg-white px-3 py-2 text-xs text-[--walnut-900] outline-none focus:border-[--copper]"
        />
        <button
          onClick={() => runAgenticCommand(agentInput)}
          disabled={typedDisabled}
          className="w-full px-3 py-2 rounded border text-xs font-semibold transition-colors"
          style={typedDisabled ? disabledButtonStyle : primaryButtonStyle}
        >
          Run Typed Agentic Command
        </button>

        {agentStatus && (
          <div className={`p-2.5 rounded border text-xs font-sans ${
            agentStatus.ok
              ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {agentStatus.message}
          </div>
        )}
      </div>
    </div>
  );
}
