"use client";

import { useState } from "react";
import * as THREE from "three";
import { useRobotStore } from "@/state/robotStore";
import { useVoiceCommand } from "../hooks/useVoiceCommand";
import { moveTo } from "@/lib/moveTo";

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
  const { isListening, transcript, lastAction, startListening } = useVoiceCommand();
  const [agentInput, setAgentInput] = useState("");
  const [agentStatus, setAgentStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);

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
      : { ok: false, message: `Blocked by safety validator: ${result.reason}`, reason: result.reason };
  };

  const runAgenticCommand = async (instruction: string) => {
    const trimmed = instruction.trim();
    if (!trimmed || agentBusy) return;

    setAgentBusy(true);
    setAgentStatus({ ok: true, message: "Interpreting with Groq..." });

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

      const msg = `${parsed.confirmation} ${actions.length} action(s) executed safely.`;
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

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Voice Control
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans">
          Deterministic commands run locally. Agentic commands use Groq, then still pass through moveTo safety validation.
        </p>
      </div>

      <div className="rounded border border-[--steel-200] p-3 space-y-3">
        <p className="text-[11px] font-bold text-[--steel-600] uppercase tracking-wider font-sans">
          Deterministic Speech
        </p>
        <button
          onClick={startListening}
          disabled={isListening}
          className={`w-full px-4 py-2 rounded font-semibold text-sm border transition-colors ${
            isListening
              ? "bg-red-600 border-red-600 text-white"
              : "bg-[--walnut-700] border-[--walnut-700] text-white hover:bg-[--walnut-900]"
          }`}
        >
          {isListening ? "Listening..." : "Click to Speak"}
        </button>
        <div className="text-xs text-[--steel-600] space-y-1">
          <p><span className="font-semibold text-[--walnut-700]">You said:</span> {transcript || "..."}</p>
          <p><span className="font-semibold text-[--walnut-700]">Action:</span> {lastAction}</p>
        </div>
      </div>

      <div className="rounded border border-[--steel-200] p-3 space-y-3">
        <p className="text-[11px] font-bold text-[--steel-600] uppercase tracking-wider font-sans">
          Phase 3B Agentic Voice
        </p>
        <textarea
          value={agentInput}
          onChange={(e) => setAgentInput(e.target.value)}
          placeholder='Try: "move to key 4 then move up a little"'
          rows={3}
          className="w-full rounded border border-[--steel-300] bg-white px-3 py-2 text-xs text-[--walnut-900] outline-none focus:border-[--copper]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => runAgenticCommand(agentInput)}
            disabled={agentBusy || !agentInput.trim()}
            className="flex-1 px-3 py-2 rounded bg-[--walnut-700] text-white text-xs font-semibold disabled:opacity-40 hover:bg-[--walnut-900]"
          >
            {agentBusy ? "Thinking..." : "Run Agentic Command"}
          </button>
          <button
            onClick={() => {
              setAgentInput(transcript);
              if (transcript) void runAgenticCommand(transcript);
            }}
            disabled={agentBusy || !transcript}
            className="px-3 py-2 rounded border border-[--steel-400] bg-[--panel] text-[--walnut-700] text-xs font-semibold disabled:opacity-40 hover:bg-white"
          >
            Use Transcript
          </button>
        </div>
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
