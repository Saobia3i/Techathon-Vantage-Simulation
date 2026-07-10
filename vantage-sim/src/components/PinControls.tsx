"use client";

import { useMemo, useState } from "react";
import { cancelArmAnimation, moveToSmooth as moveTo } from "../lib/animateArm";
import { moveTo as validateMoveTo } from "../lib/moveTo";
import { formatSafetyReason } from "@/lib/safetyMessages";
import { useRobotStore } from "../state/robotStore";

interface PinControlsProps {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
}

type PinValidation =
  | { ok: true; sequence: string[]; normalized: string; message: string }
  | { ok: false; sequence: string[]; normalized: string; message: string; reason: string };

type StepState = {
  index: number;
  digit: string;
  status: "pending" | "running" | "success" | "failed";
  message: string;
};

type MotionTarget = { x: number; y: number; z: number };

type PinMotionStep = {
  index: number;
  digit: string;
  phase: "approach" | "touch" | "retract";
  target: MotionTarget;
};

const PIN_LENGTH = 6;
const APPROACH_LIFT_METERS = 0.055;
const DWELL_MS = 450;
const TRAVEL_MS = 680;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function restoreRobotPose(angles: number[]) {
  const { robot, jointNames } = useRobotStore.getState();
  if (!robot) return;
  jointNames.forEach((name, index) => {
    robot.setJointValue(name, angles[index] ?? 0);
  });
  robot.updateMatrixWorld(true);
  useRobotStore.getState().setCurrentAngles(angles);
}

function validatePinInput(raw: string, availableKeys: string[]): PinValidation {
  const normalized = raw.replace(/[\s,-]/g, "");
  const sequence = normalized.split("").filter(Boolean);
  const availableSet = new Set(availableKeys);

  if (raw.trim().length === 0) {
    return {
      ok: false,
      sequence: [],
      normalized,
      message: `Enter a 6-digit PIN using loaded board keys: ${availableKeys.join(", ") || "none"}.`,
      reason: "pin_empty",
    };
  }

  if (/[^0-9]/.test(normalized)) {
    return {
      ok: false,
      sequence,
      normalized,
      message: "Invalid input: use digits only. Spaces, commas, and hyphens are allowed as separators.",
      reason: "pin_contains_non_digit",
    };
  }

  if (sequence.length !== PIN_LENGTH) {
    return {
      ok: false,
      sequence,
      normalized,
      message: `Invalid length: expected ${PIN_LENGTH} digits, received ${sequence.length}.`,
      reason: "pin_invalid_length",
    };
  }

  const invalidDigit = sequence.find((digit) => !availableSet.has(digit));
  if (invalidDigit) {
    return {
      ok: false,
      sequence,
      normalized,
      message: `Digit ${invalidDigit} not available on this panel. Available keys: ${availableKeys.join(", ") || "none"}.`,
      reason: "pin_digit_out_of_range",
    };
  }

  return {
    ok: true,
    sequence,
    normalized,
    message: `Validated sequence: ${sequence.join(" -> ")}`,
  };
}

export default function PinControls({ onStatusChange }: PinControlsProps) {
  const keyPositions = useRobotStore((state) => state.keyPositions);
  const [pinInput, setPinInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [status, setStatus] = useState("Ready for PIN input");
  const [steps, setSteps] = useState<StepState[]>([]);

  const availableKeys = useMemo(() => Object.keys(keyPositions).sort((a, b) => Number(a) - Number(b)), [keyPositions]);
  const validation = useMemo(
    () => validatePinInput(pinInput, availableKeys),
    [pinInput, availableKeys],
  );

  const setStepStatus = (index: number, status: StepState["status"], message: string) => {
    setSteps((prev) =>
      prev.map((step) => (step.index === index ? { ...step, status, message } : step)),
    );
  };

  const report = (msg: string, success: boolean, reason?: string) => {
    setStatus(msg);
    onStatusChange?.(msg, success, reason);
  };

  const buildMotionPlan = (sequence: string[]): PinMotionStep[] => {
    return sequence.flatMap((digit, index) => {
      const target = keyPositions[digit];
      const approach = { x: target.x, y: target.y + APPROACH_LIFT_METERS, z: target.z };
      return [
        { index, digit, phase: "approach" as const, target: approach },
        { index, digit, phase: "touch" as const, target },
        { index, digit, phase: "retract" as const, target: approach },
      ];
    });
  };

  const preflightMotionPlan = (
    plan: PinMotionStep[],
  ): { ok: true } | { ok: false; step: PinMotionStep; reason?: string; message: string } => {
    const { robot, jointNames } = useRobotStore.getState();
    if (!robot || jointNames.length === 0) {
      return {
        ok: false,
        step: plan[0],
        reason: "robot_not_loaded",
        message: "PIN rejected before motion: robot is not loaded.",
      };
    }

    cancelArmAnimation();
    const originalAngles = jointNames.map((name) => (robot.joints[name]?.angle as number) ?? 0);

    for (const step of plan) {
      const result = validateMoveTo(step.target);
      if (!result.success) {
        restoreRobotPose(originalAngles);
        return {
          ok: false,
          step,
          reason: result.reason,
          message: `PIN rejected before motion at key ${step.digit} ${step.phase}: ${formatSafetyReason(result.reason)}`,
        };
      }
    }

    restoreRobotPose(originalAngles);
    return { ok: true };
  };

  const executePin = async () => {
    if (isExecuting) return;

    if (!validation.ok) {
      report(validation.message, false, validation.reason);
      return;
    }

    const motionPlan = buildMotionPlan(validation.sequence);
    setSteps(
      validation.sequence.map((digit, index) => ({
        index,
        digit,
        status: "pending",
        message: "Waiting",
      })),
    );

    report(`Preflight validating PIN: ${validation.sequence.join(" -> ")}`, true);
    const preflight = preflightMotionPlan(motionPlan);
    if (!preflight.ok) {
      setStepStatus(preflight.step.index, "failed", preflight.message);
      report(preflight.message, false, preflight.reason);
      return;
    }

    setIsExecuting(true);
    report(`Starting validated PIN: ${validation.sequence.join(" -> ")}`, true);

    for (let index = 0; index < validation.sequence.length; index++) {
      const digit = validation.sequence[index];
      const target = keyPositions[digit];

      if (!target) {
        const msg = `Key ${digit} target disappeared during execution.`;
        setStepStatus(index, "failed", msg);
        report(msg, false, "pin_key_not_loaded");
        setIsExecuting(false);
        return;
      }

      const approach = { x: target.x, y: target.y + APPROACH_LIFT_METERS, z: target.z };

      setStepStatus(index, "running", "Approaching");
      report(`Approaching key ${digit}`, true);
      const approachResult = moveTo(approach);
      if (!approachResult.success) {
        const msg = `Key ${digit} approach blocked: ${formatSafetyReason(approachResult.reason)}`;
        setStepStatus(index, "failed", msg);
        report(msg, false, approachResult.reason);
        setIsExecuting(false);
        return;
      }
      await delay(TRAVEL_MS);

      setStepStatus(index, "running", "Touching");
      report(`Touching key ${digit}`, true);
      const touchResult = moveTo(target);
      if (!touchResult.success) {
        const msg = `Key ${digit} touch blocked: ${formatSafetyReason(touchResult.reason)}`;
        setStepStatus(index, "failed", msg);
        report(msg, false, touchResult.reason);
        setIsExecuting(false);
        return;
      }
      await delay(DWELL_MS);

      setStepStatus(index, "running", "Retracting");
      const retractResult = moveTo(approach);
      if (!retractResult.success) {
        const msg = `Key ${digit} retract blocked: ${formatSafetyReason(retractResult.reason)}`;
        setStepStatus(index, "failed", msg);
        report(msg, false, retractResult.reason);
        setIsExecuting(false);
        return;
      }
      await delay(TRAVEL_MS);

      setStepStatus(index, "success", "Done");
    }

    report(`PIN complete: ${validation.sequence.join("")}`, true);
    setIsExecuting(false);
  };

  const isValid = validation.ok;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Autonomous PIN Entry
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans">
          Type any candidate PIN. The sequencer validates it against the six loaded board keys before motion.
        </p>
      </div>

      <div className="rounded border border-[--steel-400] p-3 space-y-3">
        <label className="block text-[11px] font-bold text-[--walnut-700] uppercase tracking-wider font-sans">
          PIN Input
        </label>
        <input
          type="text"
          value={pinInput}
          onChange={(event) => setPinInput(event.target.value)}
          disabled={isExecuting}
          className="w-full rounded border border-[--steel-400] bg-white px-3 py-2 text-sm text-[--walnut-900] outline-none focus:border-[--copper] font-mono"
          placeholder={availableKeys.length ? `Example: ${availableKeys.join("-")}` : "Example: 1-2-3-4-5-6"}
          inputMode="numeric"
        />

        <div
          className={`rounded border p-2.5 text-xs font-sans ${
            isValid
              ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          <p className="font-semibold">{validation.message}</p>
          <p className="mt-1 font-mono">
            Normalized: {validation.normalized || "none"} | Loaded keys: {availableKeys.join(", ") || "none"}
          </p>
        </div>

        <button
          onClick={executePin}
          disabled={isExecuting || !isValid}
          className="w-full px-4 py-2 rounded border text-sm font-semibold transition-colors"
          style={{
            backgroundColor: isExecuting || !isValid ? "var(--steel-200)" : "var(--walnut-700)",
            borderColor: isExecuting || !isValid ? "var(--steel-400)" : "var(--walnut-700)",
            color: isExecuting || !isValid ? "var(--steel-600)" : "#ffffff",
          }}
        >
          {isExecuting ? "Executing..." : "Run Validated PIN"}
        </button>
      </div>

      <div className="rounded border border-[--steel-400] p-3 space-y-2">
        <p className="text-[11px] font-bold text-[--walnut-700] uppercase tracking-wider font-sans">
          Validated Output
        </p>
        {steps.length === 0 ? (
          <p className="text-xs text-[--steel-600] font-sans">{status}</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5">
            {steps.map((step) => (
              <div
                key={`${step.index}-${step.digit}`}
                className="flex items-center justify-between rounded border border-[--steel-200] bg-[--panel] px-2.5 py-2 text-xs"
              >
                <span className="font-mono text-[--walnut-700]">
                  #{step.index + 1} Key {step.digit}
                </span>
                <span
                  className={
                    step.status === "success"
                      ? "text-[--safe-text] font-semibold"
                      : step.status === "failed"
                        ? "text-red-700 font-semibold"
                        : "text-[--steel-600] font-semibold"
                  }
                >
                  {step.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
