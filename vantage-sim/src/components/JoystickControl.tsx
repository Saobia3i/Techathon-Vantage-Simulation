"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { moveToSmooth as moveTo } from "@/lib/animateArm";
import { formatSafetyReason } from "@/lib/safetyMessages";
import { getStylusTipWorldPosition } from "@/lib/stylusTip";
import { useRobotStore } from "@/state/robotStore";

type Props = {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
};

type WorldPos = { x: number; y: number; z: number };

const JOYSTICK_SIZE = 112;
const STICK_SIZE = 34;
const MAX_DRAG_STEP = 0.022;
const DPAD_STEP = 0.02;
const MOVE_INTERVAL_MS = 120;
const SMOOTH_MS = 110;
const MIN_Y = 0.04;
const MAX_Y = 0.85;

function readEndEffectorTip(): WorldPos | null {
  const { robot, stylusLinkName } = useRobotStore.getState();
  const tip = getStylusTipWorldPosition(robot, stylusLinkName);
  if (!tip) return null;
  return { x: tip.x, y: tip.y, z: tip.z };
}

function formatPos(pos: WorldPos) {
  return `(${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`;
}

export function JoystickControl({ onStatusChange }: Props) {
  const padRef = useRef<HTMLDivElement>(null);
  const lastMoveAtRef = useRef(0);
  const dragVectorRef = useRef({ x: 0, z: 0 });
  const [height, setHeight] = useState(0.28);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });

  const currentAngles = useRobotStore((state) => state.currentAngles);
  const robotLoaded = useRobotStore((state) => Boolean(state.robot));

  const report = useCallback(
    (ok: boolean, msg: string, reason?: string) => {
      setFeedback({ ok, msg });
      onStatusChange?.(msg, ok, reason);
    },
    [onStatusChange],
  );

  const driveTo = useCallback(
    (target: WorldPos, label = "Joystick") => {
      const result = moveTo(target, SMOOTH_MS);
      if (result.success) {
        report(true, `${label} -> ${formatPos(target)}`);
        return true;
      }

      const msg = `${label} blocked: ${formatSafetyReason(result.reason)}`;
      report(false, msg, result.reason);
      return false;
    },
    [report],
  );

  const nudge = useCallback(
    (delta: Partial<WorldPos>, label: string) => {
      const current = readEndEffectorTip();
      if (!current) {
        report(false, "Joystick blocked: robot is not loaded", "robot_not_loaded");
        return;
      }

      driveTo(
        {
          x: current.x + (delta.x ?? 0),
          y: current.y + (delta.y ?? 0),
          z: current.z + (delta.z ?? 0),
        },
        label,
      );
    },
    [driveTo, report],
  );

  const driveFromStick = useCallback(() => {
    const vector = dragVectorRef.current;
    const magnitude = Math.hypot(vector.x, vector.z);
    if (magnitude < 0.05) return;

    const current = readEndEffectorTip();
    if (!current) {
      report(false, "Joystick blocked: robot is not loaded", "robot_not_loaded");
      return;
    }

    driveTo(
      {
        x: current.x + vector.x * MAX_DRAG_STEP,
        y: current.y,
        z: current.z + vector.z * MAX_DRAG_STEP,
      },
      "Joystick drag",
    );
  }, [driveTo, report]);

  const updateStickFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const pad = padRef.current;
      if (!pad) return;

      const rect = pad.getBoundingClientRect();
      const radius = (JOYSTICK_SIZE - STICK_SIZE) / 2;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const rawX = clientX - centerX;
      const rawY = clientY - centerY;
      const dist = Math.hypot(rawX, rawY);
      const scale = dist > radius ? radius / dist : 1;
      const x = rawX * scale;
      const y = rawY * scale;

      setStick({ x, y });
      dragVectorRef.current = {
        x: x / radius,
        z: y / radius,
      };

      const now = performance.now();
      if (now - lastMoveAtRef.current >= MOVE_INTERVAL_MS) {
        lastMoveAtRef.current = now;
        driveFromStick();
      }
    },
    [driveFromStick],
  );

  useEffect(() => {
    const current = readEndEffectorTip();
    if (current) setHeight(current.y);
  }, [currentAngles, robotLoaded]);

  useEffect(() => {
    if (!dragging) return;

    const timer = window.setInterval(driveFromStick, MOVE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [dragging, driveFromStick]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    lastMoveAtRef.current = 0;
    updateStickFromPointer(event.clientX, event.clientY);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateStickFromPointer(event.clientX, event.clientY);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    setStick({ x: 0, y: 0 });
    dragVectorRef.current = { x: 0, z: 0 };

    const current = readEndEffectorTip();
    if (current) {
      setHeight(current.y);
      report(true, `Joystick hold -> ${formatPos(current)}`);
    }
  };

  const handleHeightChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextY = Number(event.target.value);
    setHeight(nextY);

    const current = readEndEffectorTip();
    if (!current) {
      report(false, "Height control blocked: robot is not loaded", "robot_not_loaded");
      return;
    }

    driveTo({ x: current.x, y: nextY, z: current.z }, "Height");
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Joystick Control Surface
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans">
          X/Z drag uses live end-effector position. Height changes only world Y. Every target is validated by moveTo.
        </p>
      </div>

      <div className="rounded border border-[--steel-300] bg-[--steel-100]/35 p-3 space-y-4">
        <div className="grid grid-cols-[1fr_86px] gap-3 items-center">
          <div className="flex flex-col items-center gap-2">
            <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans">
              X / Z Plane
            </p>
            <div
              ref={padRef}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative rounded-full border-2 border-[--steel-400] bg-[--panel] shadow-inner"
              style={{
                width: JOYSTICK_SIZE,
                height: JOYSTICK_SIZE,
                touchAction: "none",
                cursor: dragging ? "grabbing" : "grab",
                background:
                  "radial-gradient(circle at 50% 50%, rgba(184,118,63,0.18), rgba(246,244,240,0.96) 62%)",
              }}
            >
              <div className="absolute left-1/2 top-1/2 h-[1px] w-[82px] -translate-x-1/2 bg-[--steel-300]" />
              <div className="absolute left-1/2 top-1/2 h-[82px] w-[1px] -translate-y-1/2 bg-[--steel-300]" />
              <div
                className="absolute rounded-full border border-white/40 bg-[--walnut-900] shadow-lg"
                style={{
                  width: STICK_SIZE,
                  height: STICK_SIZE,
                  left: `calc(50% - ${STICK_SIZE / 2}px + ${stick.x}px)`,
                  top: `calc(50% - ${STICK_SIZE / 2}px + ${stick.y}px)`,
                  transition: dragging ? "none" : "left 120ms ease, top 120ms ease",
                }}
              />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 border-l border-[--steel-300]/70 pl-3">
            <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans">
              Y Height
            </p>
            <div className="flex items-center gap-2 h-[118px]">
              <input
                type="range"
                min={MIN_Y}
                max={MAX_Y}
                step="0.01"
                value={height}
                onChange={handleHeightChange}
                className="cursor-pointer"
                style={{
                  writingMode: "vertical-lr" as React.CSSProperties["writingMode"],
                  direction: "rtl",
                  height: 98,
                  width: 18,
                  accentColor: "var(--copper)",
                }}
              />
              <span className="w-[42px] text-right text-[10px] font-bold font-mono text-[--walnut-700]">
                {height.toFixed(2)}m
              </span>
            </div>
          </div>
        </div>

        <div className="rounded border border-[--steel-300] bg-[--panel] p-3">
          <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans mb-2 text-center">
            Step Nudges
          </p>
          <div className="grid grid-cols-3 gap-1.5 max-w-[190px] mx-auto">
            <button className="h-8 rounded border border-[--steel-300] text-[10px] font-bold text-[--walnut-700]" onClick={() => nudge({ z: -DPAD_STEP }, "Forward")}>
              FWD
            </button>
            <button className="h-8 rounded border border-[--steel-300] text-[10px] font-bold text-[--walnut-700]" onClick={() => nudge({ y: DPAD_STEP }, "Up")}>
              +Y
            </button>
            <button className="h-8 rounded border border-[--steel-300] text-[10px] font-bold text-[--walnut-700]" onClick={() => nudge({ z: DPAD_STEP }, "Backward")}>
              BACK
            </button>
            <button className="h-8 rounded border border-[--steel-300] text-[10px] font-bold text-[--walnut-700]" onClick={() => nudge({ x: -DPAD_STEP }, "Left")}>
              LEFT
            </button>
            <button className="h-8 rounded border border-[--steel-300] text-[10px] font-bold text-[--walnut-700]" onClick={() => nudge({ y: -DPAD_STEP }, "Down")}>
              -Y
            </button>
            <button className="h-8 rounded border border-[--steel-300] text-[10px] font-bold text-[--walnut-700]" onClick={() => nudge({ x: DPAD_STEP }, "Right")}>
              RIGHT
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-2.5 rounded text-xs border font-mono ${
            feedback.ok
              ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {feedback.msg}
        </div>
      )}
    </div>
  );
}

export default JoystickControl;
