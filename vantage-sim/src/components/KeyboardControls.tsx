"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { moveToSmooth as moveTo } from "@/lib/animateArm";
import { formatSafetyReason } from "@/lib/safetyMessages";
import { getStylusTipWorldPosition } from "@/lib/stylusTip";
import { useRobotStore } from "@/state/robotStore";

const STEP_NORMAL = 0.02;
const STEP_FINE = 0.005;
const KEYBOARD_MOVE_MS = 30;
const KEY_REPEAT_THROTTLE_MS = 30;

const KEY_BINDINGS = [
  { key: "W", axis: "z" as const, dir: -1, label: "Forward (-Z)" },
  { key: "S", axis: "z" as const, dir: 1, label: "Backward (+Z)" },
  { key: "A", axis: "x" as const, dir: -1, label: "Left (-X)" },
  { key: "D", axis: "x" as const, dir: 1, label: "Right (+X)" },
  { key: "Q", axis: "y" as const, dir: 1, label: "Up (+Y)" },
  { key: "E", axis: "y" as const, dir: -1, label: "Down (-Y)" },
];

type Axis = "x" | "y" | "z";

export function KeyboardControls({
  onStatusChange,
  isHUD,
}: {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
  isHUD?: boolean;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [focused, setFocused] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastMoveAtRef = useRef(0);

  const getEePos = useCallback((): THREE.Vector3 | null => {
    const { robot, stylusLinkName } = useRobotStore.getState();
    return getStylusTipWorldPosition(robot, stylusLinkName);
  }, []);

  const report = useCallback(
    (msg: string, success: boolean, reason?: string) => {
      setIsSuccess(success);
      setFeedback(msg);
      onStatusChange?.(msg, success, reason);
    },
    [onStatusChange],
  );

  const handleNudge = useCallback(
    (axis: Axis, dir: number, fine: boolean) => {
      const curPos = getEePos();
      if (!curPos) {
        report("Keyboard blocked: robot or stylus tip is not loaded", false, "robot_not_loaded");
        return;
      }

      const step = fine ? STEP_FINE : STEP_NORMAL;
      const target = {
        x: curPos.x + (axis === "x" ? step * dir : 0),
        y: curPos.y + (axis === "y" ? step * dir : 0),
        z: curPos.z + (axis === "z" ? step * dir : 0),
      };

      console.log(`[KeyboardControls] Nudge trigger: axis=${axis}, dir=${dir}, fine=${fine}, current=(${curPos.x.toFixed(3)}, ${curPos.y.toFixed(3)}, ${curPos.z.toFixed(3)}) -> target=(${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)})`);

      if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
        report("Keyboard blocked: invalid target coordinate", false, "invalid_target");
        return;
      }

      const result = moveTo(target, KEYBOARD_MOVE_MS);
      if (result.success) {
        const label = fine ? "fine" : "step";
        const sign = dir > 0 ? "+" : "-";
        const msg = `[${axis.toUpperCase()}${sign}][${label}] -> (${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)})`;
        console.log(`[KeyboardControls] Move success: ${msg}`);
        report(msg, true);
        return;
      }

      console.warn(`[KeyboardControls] Move blocked: ${result.reason} (target: ${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)})`);
      report(`[${axis.toUpperCase()}] blocked: ${formatSafetyReason(result.reason)}`, false, result.reason);
    },
    [getEePos, report],
  );

  const handleKeyCommand = useCallback(
    (key: string, shiftKey: boolean, eventTarget: EventTarget | null) => {
      if (key === "Shift") {
        setShiftHeld(true);
        return true;
      }

      const target = eventTarget as HTMLElement | null;
      const tagName = target?.tagName;
      if (
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
      ) {
        return false;
      }

      let forceNormalStep = false;
      const upperKey = key.toUpperCase();
      let binding = KEY_BINDINGS.find((item) => item.key === upperKey);

      // Support alternative gaming keyboard bindings: Arrow keys, Space, C, PageUp/PageDown, and direct X/Y/Z keys
      if (!binding) {
        if (key === "ArrowUp") binding = KEY_BINDINGS.find((b) => b.key === "W");
        else if (key === "ArrowDown") binding = KEY_BINDINGS.find((b) => b.key === "S");
        else if (key === "ArrowLeft") binding = KEY_BINDINGS.find((b) => b.key === "A");
        else if (key === "ArrowRight") binding = KEY_BINDINGS.find((b) => b.key === "D");
        else if (key === "Spacebar" || key === " " || key === "PageUp") binding = KEY_BINDINGS.find((b) => b.key === "Q");
        else if (key === "c" || key === "C" || key === "PageDown") binding = KEY_BINDINGS.find((b) => b.key === "E");
        else if (key === "x") binding = KEY_BINDINGS.find((b) => b.key === "D");
        else if (key === "X") {
          binding = KEY_BINDINGS.find((b) => b.key === "A");
          forceNormalStep = true;
        }
        else if (key === "y") binding = KEY_BINDINGS.find((b) => b.key === "Q");
        else if (key === "Y") {
          binding = KEY_BINDINGS.find((b) => b.key === "E");
          forceNormalStep = true;
        }
        else if (key === "z") binding = KEY_BINDINGS.find((b) => b.key === "W");
        else if (key === "Z") {
          binding = KEY_BINDINGS.find((b) => b.key === "S");
          forceNormalStep = true;
        }
      }

      if (!binding) return false;

      const now = performance.now();
      if (now - lastMoveAtRef.current < KEY_REPEAT_THROTTLE_MS) {
        return true;
      }
      lastMoveAtRef.current = now;

      console.log(`[KeyboardControls] Key matched: ${key} -> mapped to binding: ${binding.key} (${binding.label})`);
      setActiveKey(binding.key);
      handleNudge(binding.axis, binding.dir, forceNormalStep ? false : shiftKey);
      return true;
    },
    [handleNudge],
  );

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    setFocused(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const handled = handleKeyCommand(event.key, event.shiftKey, event.target);
      if (handled) event.preventDefault();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") setShiftHeld(false);
      setActiveKey(null);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handleKeyCommand]);

  if (isHUD) {
    return (
      <div
        ref={panelRef}
        tabIndex={0}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setActiveKey(null);
          setShiftHeld(false);
        }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-md transition-all text-[10px] font-sans font-semibold cursor-pointer outline-none select-none ${
          focused
            ? "border-[--copper] bg-[--panel]/90 text-[--walnut-900]"
            : "border-[--steel-400]/40 bg-[--panel]/70 text-[--steel-600] hover:border-[--copper]/40"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${focused ? (shiftHeld ? "bg-amber-500 animate-pulse" : "bg-[--copper] animate-pulse") : "bg-slate-400"}`} />
        <span>
          {focused
            ? feedback
              ? feedback
              : shiftHeld
              ? "KB: FINE-STEP (5mm)"
              : "KB: ACTIVE (WASD+QE)"
            : "Click for Keyboard Control"}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Keyboard control surface
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans mb-3">
          Use WASD + QE while this tab is open. Shift enables fine-step (5 mm).
        </p>
      </div>

      <div
        ref={panelRef}
        tabIndex={0}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setActiveKey(null);
          setShiftHeld(false);
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const handled = handleKeyCommand(event.key, event.shiftKey, event.target);
          if (!handled) return;
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation();
        }}
        onKeyUp={(event) => {
          if (event.key === "Shift") setShiftHeld(false);
          setActiveKey(null);
        }}
        className={`relative flex h-20 cursor-pointer select-none items-center justify-center rounded border-2 outline-none transition-all ${
          focused
            ? shiftHeld
              ? "border-amber-500 bg-amber-50"
              : "border-[--copper] bg-[--copper]/10"
            : "border-dashed border-[--steel-400] bg-[--panel] hover:border-[--copper]/50"
        }`}
      >
        <span className="text-sm font-sans font-medium text-[--steel-600]">
          {focused ? (
            <span className={`flex items-center gap-2 font-semibold ${shiftHeld ? "text-amber-600" : "text-[--copper]"}`}>
              <span className={`inline-block h-2 w-2 animate-pulse rounded-full ${shiftHeld ? "bg-amber-500" : "bg-[--copper]"}`} />
              {shiftHeld ? "FINE-STEP active (5 mm)" : "Keyboard controls: ACTIVE"}
            </span>
          ) : (
            "Click here to activate keyboard controls"
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {KEY_BINDINGS.map(({ key, label }) => (
          <div
            key={key}
            className={`flex items-center gap-2 rounded border p-2 text-xs font-sans transition-all ${
              activeKey === key
                ? "border-[--copper] bg-[--copper]/10 text-[--walnut-900]"
                : "border-[--steel-200] bg-[--panel] text-[--steel-600]"
            }`}
          >
            <kbd
              className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                activeKey === key
                  ? "border-[--copper] bg-[--copper] text-white"
                  : "border-[--steel-400] bg-white text-[--walnut-900]"
              }`}
            >
              {key}
            </kbd>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {feedback && (
        <div
          className={`rounded border p-2.5 font-mono text-xs ${
            isSuccess
              ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback}
        </div>
      )}
    </div>
  );
}
