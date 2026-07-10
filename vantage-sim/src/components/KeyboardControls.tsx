"use client";

import { useRobotStore } from "@/state/robotStore";
import { moveToSmooth as moveTo } from "@/lib/animateArm";
import { formatSafetyReason } from "@/lib/safetyMessages";
import { getStylusTipWorldPosition } from "@/lib/stylusTip";
import * as THREE from "three";
import { useState, useEffect, useCallback, useRef } from "react";

const STEP_NORMAL = 0.02;  // 2 cm
const STEP_FINE   = 0.005; // 5 mm — teammate's Shift fine-step

const KEYBOARD_MOVE_MS = 95;
const KEY_REPEAT_THROTTLE_MS = 85;

const KEY_BINDINGS = [
  { key: "W", axis: "z" as const, dir: -1, label: "Forward (−Z)" },
  { key: "S", axis: "z" as const, dir: 1,  label: "Backward (+Z)" },
  { key: "A", axis: "x" as const, dir: -1, label: "Left (−X)" },
  { key: "D", axis: "x" as const, dir: 1,  label: "Right (+X)" },
  { key: "Q", axis: "y" as const, dir: 1,  label: "Up (+Y)" },
  { key: "E", axis: "y" as const, dir: -1, label: "Down (−Y)" },
];

export function KeyboardControls({
  onStatusChange,
}: {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
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

  const handleNudge = useCallback(
    (axis: "x" | "y" | "z", dir: number, fine: boolean) => {
      const curPos = getEePos();
      if (!curPos) {
        const msg = "Keyboard blocked: robot or stylus tip is not loaded";
        setIsSuccess(false);
        setFeedback(msg);
        onStatusChange?.(msg, false, "robot_not_loaded");
        return;
      }

      const step = fine ? STEP_FINE : STEP_NORMAL;
      const target = {
        x: curPos.x + (axis === "x" ? step * dir : 0),
        y: curPos.y + (axis === "y" ? step * dir : 0),
        z: curPos.z + (axis === "z" ? step * dir : 0),
      };

      if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
        const msg = "Keyboard blocked: invalid target coordinate";
        setIsSuccess(false);
        setFeedback(msg);
        onStatusChange?.(msg, false, "invalid_target");
        return;
      }

      const res = moveTo(target, KEYBOARD_MOVE_MS);
      if (res.success) {
        setIsSuccess(true);
        const label = fine ? "fine" : "step";
        const msg = `[${axis.toUpperCase()}${dir > 0 ? "+" : "−"}][${label}] → (${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)})`;
        setFeedback(msg);
        onStatusChange?.(msg, true);
      } else {
        setIsSuccess(false);
        const msg = `[${axis.toUpperCase()}] blocked: ${formatSafetyReason(res.reason)}`;
        setFeedback(msg);
        onStatusChange?.(msg, false, res.reason);
      }
    },
    [getEePos, onStatusChange]
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

      const binding = KEY_BINDINGS.find((b) => b.key === key.toUpperCase());
      if (!binding) return false;

      const now = performance.now();
      if (now - lastMoveAtRef.current < KEY_REPEAT_THROTTLE_MS) {
        return true;
      }
      lastMoveAtRef.current = now;

      setActiveKey(key.toUpperCase());
      handleNudge(binding.axis, binding.dir, shiftKey);
      return true;
    },
    [handleNudge],
  );

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    setFocused(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const handled = handleKeyCommand(e.key, e.shiftKey, e.target);
      if (!handled) return;
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
      setActiveKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handleKeyCommand]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Keyboard control surface
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans mb-3">
          Use WASD + QE while this tab is open. Click the zone below only if you want the active indicator.{" "}
          <kbd className="px-1 py-0.5 rounded border border-[--steel-400] bg-white text-[10px] font-mono text-[--walnut-900]">⇧ Shift</kbd>{" "}
          <span className="text-[11px]">enables fine-step (5 mm).</span>
        </p>
      </div>

      {/* Activation zone */}
      <div
        ref={panelRef}
        tabIndex={0}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setActiveKey(null); setShiftHeld(false); }}
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
        className={`relative flex items-center justify-center h-20 rounded border-2 cursor-pointer select-none outline-none transition-all ${
          focused
            ? shiftHeld
              ? "border-amber-500 bg-amber-50"
              : "border-[--copper] bg-[--copper]/10"
            : "border-dashed border-[--steel-400] bg-[--panel] hover:border-[--copper]/50"
        }`}
      >
        <span className="text-sm font-sans font-medium text-[--steel-600]">
          {focused ? (
            <span className={`font-semibold flex items-center gap-2 ${shiftHeld ? "text-amber-600" : "text-[--copper]"}`}>
              <span className={`w-2 h-2 rounded-full animate-pulse inline-block ${shiftHeld ? "bg-amber-500" : "bg-[--copper]"}`} />
              {shiftHeld ? "FINE-STEP active (5 mm)" : "Keyboard controls: ACTIVE"}
            </span>
          ) : (
            "Click here to activate keyboard controls"
          )}
        </span>
      </div>

      {/* Key bindings table */}
      <div className="grid grid-cols-2 gap-1.5">
        {KEY_BINDINGS.map(({ key, label }) => (
          <div
            key={key}
            className={`flex items-center gap-2 p-2 rounded border text-xs font-sans transition-all ${
              activeKey === key
                ? "border-[--copper] bg-[--copper]/10 text-[--walnut-900]"
                : "border-[--steel-200] bg-[--panel] text-[--steel-600]"
            }`}
          >
            <kbd className={`px-1.5 py-0.5 rounded font-mono font-bold text-[11px] border ${
              activeKey === key
                ? "bg-[--copper] text-white border-[--copper]"
                : "bg-white text-[--walnut-900] border-[--steel-400]"
            }`}>
              {key}
            </kbd>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {feedback && (
        <div className={`p-2.5 rounded text-xs border font-mono ${
          isSuccess ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]" : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {feedback}
        </div>
      )}
    </div>
  );
}
