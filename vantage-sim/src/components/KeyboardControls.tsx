"use client";

import { useRobotStore } from "@/state/robotStore";
import { moveTo } from "@/lib/moveTo";
import * as THREE from "three";
import { useState, useEffect, useCallback, useRef } from "react";

const STEP = 0.02; // 2cm per keypress

const KEY_BINDINGS = [
  { key: "W", axis: "y" as const, dir: 1, label: "+Y (forward)" },
  { key: "S", axis: "y" as const, dir: -1, label: "−Y (back)" },
  { key: "A", axis: "x" as const, dir: -1, label: "−X (left)" },
  { key: "D", axis: "x" as const, dir: 1, label: "+X (right)" },
  { key: "Q", axis: "z" as const, dir: 1, label: "+Z (up)" },
  { key: "E", axis: "z" as const, dir: -1, label: "−Z (down)" },
];

export function KeyboardControls({
  onStatusChange,
}: {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
}) {
  const { robot, stylusLinkName } = useRobotStore();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const getEePos = useCallback((): THREE.Vector3 | null => {
    if (!robot || !stylusLinkName) return null;
    const link = robot.links[stylusLinkName];
    if (!link) return null;
    const v = new THREE.Vector3();
    link.getWorldPosition(v);
    return robot.worldToLocal(v);
  }, [robot, stylusLinkName]);

  const handleNudge = useCallback(
    (axis: "x" | "y" | "z", dir: number) => {
      const curPos = getEePos();
      if (!curPos) return;
      const target = {
        x: curPos.x + (axis === "x" ? STEP * dir : 0),
        y: curPos.y + (axis === "y" ? STEP * dir : 0),
        z: curPos.z + (axis === "z" ? STEP * dir : 0),
      };
      const res = moveTo(target);
      if (res.success) {
        setIsSuccess(true);
        const msg = `[${axis.toUpperCase()}${dir > 0 ? "+" : "−"}] EE moved to (${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)})`;
        setFeedback(msg);
        onStatusChange?.(msg, true);
      } else {
        setIsSuccess(false);
        const msg = `[${axis.toUpperCase()}] Failed: ${res.reason}`;
        setFeedback(msg);
        onStatusChange?.(msg, false, res.reason);
      }
    },
    [getEePos, onStatusChange]
  );

  useEffect(() => {
    if (!focused) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const binding = KEY_BINDINGS.find((b) => b.key === e.key.toUpperCase());
      if (!binding) return;
      e.preventDefault();
      setActiveKey(e.key.toUpperCase());
      handleNudge(binding.axis, binding.dir);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      setActiveKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [focused, handleNudge]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Keyboard control surface
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans mb-3">
          Click the activation zone below, then use WASD + QE to drive the arm.
        </p>
      </div>

      {/* Activation zone */}
      <div
        ref={panelRef}
        tabIndex={0}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setActiveKey(null); }}
        className={`relative flex items-center justify-center h-20 rounded border-2 cursor-pointer select-none outline-none transition-all ${
          focused
            ? "border-[--copper] bg-[--copper]/10"
            : "border-dashed border-[--steel-400] bg-[--panel] hover:border-[--copper]/50"
        }`}
      >
        <span className="text-sm font-sans font-medium text-[--steel-600]">
          {focused ? (
            <span className="text-[--copper] font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[--copper] animate-pulse inline-block" />
              Keyboard controls: ACTIVE
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
