"use client";

import { useRef, useState } from "react";
import * as THREE from "three";
import { useRobotStore } from "@/state/robotStore";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import { cancelArmAnimation, moveToSmooth as moveTo } from "@/lib/animateArm";
import { moveTo as validateMoveTo } from "@/lib/moveTo";
import { chooseBestVoiceTranscript, describeVoiceCorrection, getSpeechAlternatives, normalizeVoiceText } from "@/lib/voiceGrammar";
import { formatSafetyReason } from "@/lib/safetyMessages";
import { getStylusTipWorldPosition } from "@/lib/stylusTip";

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
  source?: "groq_tool" | "groq_json" | "fallback";
};

type Props = {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
  isHUD?: boolean;
};

type MotionTarget = { x: number; y: number; z: number };

type CompiledPlan =
  | { ok: true; targets: MotionTarget[] }
  | { ok: false; message: string; reason: string };

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

const ACTION_SETTLE_MS = 680;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getEeWorldPosition() {
  const { robot, stylusLinkName } = useRobotStore.getState();
  const v = getStylusTipWorldPosition(robot, stylusLinkName);
  if (!v) return null;
  return { x: v.x, y: v.y, z: v.z };
}

function rotatePointAroundWorldY(pos: MotionTarget, degrees: number) {
  const rad = THREE.MathUtils.degToRad(degrees);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: pos.x * cos - pos.z * sin,
    y: pos.y,
    z: pos.x * sin + pos.z * cos,
  };
}

function restoreRobotPose(angles: number[]) {
  const { robot, jointNames } = useRobotStore.getState();
  if (!robot) return;
  jointNames.forEach((name, index) => {
    robot.setJointValue(name, angles[index] ?? 0);
  });
  robot.updateMatrixWorld(true);
  useRobotStore.getState().setCurrentAngles(angles);
}

export default function VoiceControlPanel({ onStatusChange, isHUD }: Props) {
  const { keyPositions } = useRobotStore();
  const { isListening, transcript, lastAction, startListening } = useVoiceCommand(onStatusChange);
  const [agentInput, setAgentInput] = useState("");
  const [agentTranscript, setAgentTranscript] = useState("");
  const [agentStatus, setAgentStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentListening, setAgentListening] = useState(false);
  const agentRecognitionRef = useRef<any>(null);

  const compilePlanTargets = (actions: VoiceAction[]): CompiledPlan => {
    let simulated = getEeWorldPosition();
    if (!simulated) return { ok: false, message: "Robot is not loaded yet.", reason: "robot_not_loaded" };

    const targets: MotionTarget[] = [];
    for (const action of actions) {
      if (action.type === "clarify") {
        return { ok: false, message: action.question, reason: "clarification_needed" };
      }

      if (action.type === "reject") {
        return { ok: false, message: action.reason, reason: "agent_rejected" };
      }

      let target: MotionTarget;
      if (action.type === "move_delta") {
        target = {
          x: simulated.x + (action.dx ?? 0),
          y: simulated.y + (action.dy ?? 0),
          z: simulated.z + (action.dz ?? 0),
        };
      } else if (action.type === "move_absolute") {
        target = { x: action.x, y: action.y, z: action.z };
      } else if (action.type === "move_to_key") {
        const keyTarget = keyPositions[action.digit];
        if (!keyTarget) return { ok: false, message: `Key ${action.digit} is not loaded.`, reason: "key_not_loaded" };
        target = keyTarget;
      } else {
        target = rotatePointAroundWorldY(simulated, action.degrees);
      }

      targets.push(target);
      simulated = target;
    }

    return { ok: true, targets };
  };

  const preflightPlan = (targets: MotionTarget[]): { ok: true } | { ok: false; message: string; reason?: string; step: number } => {
    const { robot, jointNames } = useRobotStore.getState();
    if (!robot || jointNames.length === 0) {
      return { ok: false, message: "Robot is not loaded yet.", reason: "robot_not_loaded", step: 0 };
    }

    cancelArmAnimation();
    const originalAngles = jointNames.map((name) => (robot.joints[name]?.angle as number) ?? 0);

    for (let i = 0; i < targets.length; i++) {
      const result = validateMoveTo(targets[i]);
      if (!result.success) {
        restoreRobotPose(originalAngles);
        return {
          ok: false,
          message: `Plan rejected before motion at step ${i + 1}: ${formatSafetyReason(result.reason)}`,
          reason: result.reason,
          step: i + 1,
        };
      }
    }

    restoreRobotPose(originalAngles);
    return { ok: true };
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

      if (actions.length === 0) {
        const msg = "Agent returned no executable actions.";
        setAgentStatus({ ok: false, message: msg });
        onStatusChange?.(msg, false, "agentic_empty_plan");
        return;
      }

      const compiled = compilePlanTargets(actions);
      if (!compiled.ok) {
        const msg = `${parsed.confirmation} ${compiled.message}`;
        setAgentStatus({ ok: false, message: msg });
        onStatusChange?.(msg, false, compiled.reason);
        return;
      }

      setAgentStatus({ ok: true, message: `${parsed.confirmation} Preflight-validating ${compiled.targets.length} step(s)...` });
      const preflight = preflightPlan(compiled.targets);
      if (!preflight.ok) {
        const msg = `${parsed.confirmation} ${preflight.message}`;
        setAgentStatus({ ok: false, message: msg });
        onStatusChange?.(msg, false, preflight.reason);
        return;
      }

      for (let i = 0; i < compiled.targets.length; i++) {
        const target = compiled.targets[i];
        setAgentStatus({ ok: true, message: `${parsed.confirmation} Executing validated step ${i + 1}/${compiled.targets.length}...` });
        const result = moveTo(target);
        if (!result.success) {
          const msg = `${parsed.confirmation} Execution stopped at step ${i + 1}: ${formatSafetyReason(result.reason)}`;
          setAgentStatus({ ok: false, message: msg });
          onStatusChange?.(msg, false, result.reason);
          return;
        }
        await delay(ACTION_SETTLE_MS);
      }

      const sourceLabel = parsed.source === "groq_tool" ? "Groq tool-call" : parsed.source === "fallback" ? "safe fallback" : "Groq JSON";
      const msg = `${parsed.confirmation} ${actions.length} action(s) executed through moveTo. Source: ${sourceLabel}.`;
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

  if (isHUD) {
    return (
      <div className="rounded-lg bg-[--panel]/85 backdrop-blur-md border border-[--steel-400]/40 p-2 shadow-lg w-[210px] font-sans">
        <div className="border-b border-[--steel-400]/30 pb-1 mb-1.5 flex items-center justify-between">
          <span className="font-bold tracking-wider text-[--walnut-700] uppercase text-[8px]">Voice Interface</span>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={startListening}
            disabled={deterministicDisabled}
            className={`flex-1 h-7 rounded border text-[9px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              isListening ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-[--steel-200] border-[--steel-400]/30 text-[--walnut-900] hover:bg-[--copper] hover:text-[--walnut-900]"
            }`}
          >
            🎤 Local
          </button>
          <button
            onClick={startAgenticListening}
            disabled={agentMicDisabled}
            className={`flex-1 h-7 rounded border text-[9px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              agentListening ? "bg-red-500 text-white border-red-500 animate-pulse" : agentBusy ? "bg-amber-500 text-white border-amber-500 animate-pulse" : "bg-[--steel-200] border-[--steel-400]/30 text-[--walnut-900] hover:bg-[--copper] hover:text-[--walnut-900]"
            }`}
          >
            🤖 AI
          </button>
        </div>
        
        {/* Tiny expandable input for typing agent commands */}
        <div className="mt-1.5 flex gap-1">
          <input
            type="text"
            value={agentInput}
            onChange={(e) => setAgentInput(e.target.value)}
            placeholder="Type command..."
            disabled={agentBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && agentInput.trim() && !agentBusy) {
                runAgenticCommand(agentInput);
              }
            }}
            className="flex-1 rounded border border-[--steel-400]/40 bg-white/70 px-2 py-0.5 text-[9px] text-[--walnut-900] outline-none focus:border-[--copper] min-w-0"
          />
          <button
            onClick={() => runAgenticCommand(agentInput)}
            disabled={typedDisabled}
            className="px-2 h-[19px] rounded border border-[--steel-400]/40 bg-[--steel-200] hover:bg-[--copper] hover:text-[--walnut-900] text-[9px] font-bold cursor-pointer disabled:opacity-50"
          >
            Run
          </button>
        </div>

        {/* Tiny live status feedback */}
        {(transcript || agentTranscript || agentStatus) && (
          <div className={`mt-1.5 text-[8px] font-mono border-t border-[--steel-400]/20 pt-1 max-h-[56px] overflow-y-auto leading-relaxed break-words whitespace-pre-wrap ${
            agentStatus?.ok === false ? "text-red-600" : agentStatus?.ok === true && agentBusy ? "text-amber-700" : "text-[--steel-600]"
          }`}>
            {agentStatus ? agentStatus.message : (agentTranscript ? `AI: ${agentTranscript}` : `Local: ${transcript}`)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Voice Control
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans">
          Local speech handles fixed commands. Agentic speech uses Groq tool-calling, then executes only validator-approved structured actions.
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
          placeholder='Try: "move to key 4 then move up a little"'
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
