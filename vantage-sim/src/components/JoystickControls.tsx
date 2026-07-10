"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRobotStore } from "@/state/robotStore";
import * as THREE from "three";
import { moveTo } from "@/lib/moveTo";

const STEP = 0.02; // 2 cm — D-pad fallback step size

type Props = {
  onStatusChange?: (msg: string, success: boolean, reason?: string) => void;
};

export function JoystickControls({ onStatusChange }: Props) {
  const { robot, stylusLinkName } = useRobotStore();
  const joystickRef = useRef<HTMLDivElement>(null);
  const currentPos = useRef({ x: 0.12, y: 0.28, z: 0.3 });
  const [yValue, setYValue] = useState(0.28); // world Y (height)
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(true);
  const [nippleReady, setNippleReady] = useState(false);

  // Seed the ref from the real EE world position
  const getEePos = useCallback((): { x: number; y: number; z: number } | null => {
    if (!robot || !stylusLinkName) return null;
    const link = robot.links[stylusLinkName];
    if (!link) return null;
    robot.updateMatrixWorld(true);
    const v = link.localToWorld(new THREE.Vector3(0, 0, 0.04));
    return { x: v.x, y: v.y, z: v.z }; // Return world coordinates directly
  }, [robot, stylusLinkName]);

  const doMove = useCallback(
    (pos: { x: number; y: number; z: number }) => {
      currentPos.current = pos;
      const res = moveTo(pos);
      if (res.success) {
        setIsSuccess(true);
        const msg = `Joystick → (${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`;
        setFeedback(msg);
        onStatusChange?.(msg, true);
      } else {
        setIsSuccess(false);
        const msg = `Joystick failed: ${res.reason}`;
        setFeedback(msg);
        onStatusChange?.(msg, false, res.reason);
      }
    },
    [onStatusChange]
  );

  // Keep doMove reference fresh for the event listener without triggering useEffect re-runs
  const doMoveRef = useRef(doMove);
  useEffect(() => {
    doMoveRef.current = doMove;
  }, [doMove]);

  // nipple.js real joystick for X/Z world plane (screen X/Y)
  useEffect(() => {
    if (!joystickRef.current) return;

    let cancelled = false;
    let manager: any = null;

    import("nipplejs").then((mod) => {
      // If this effect was already cleaned up before the dynamic import
      // resolved (React Strict Mode double-invokes effects in dev), bail out
      // instead of creating an orphaned nipple instance on a stale zone.
      if (cancelled || !joystickRef.current) return;

      const nipple = (mod as any).default || mod;
      manager = nipple.create({
        zone: joystickRef.current as HTMLElement,
        mode: "static",
        position: { left: "50%", top: "50%" },
        color: "var(--copper)",
        size: 110,
        restOpacity: 0.75,
        fadeTime: 200,
      });
      setNippleReady(true);

      const JOYSTICK_RADIUS = 55; // half of size:110
      const MAX_SPEED = 0.018;    // max meters per event at full deflection

      manager.on("move", (_: any, data: any) => {
        if (!data?.angle) return;

        // Read LIVE EE world position every event to prevent drift
        const store = useRobotStore.getState();
        const robot = store.robot;
        const name = store.stylusLinkName || "stylus_tip";
        if (!robot) return;
        const eeLink = robot.links[name];
        if (!eeLink) return;
        robot.updateMatrixWorld(true);
        const v = eeLink.localToWorld(new THREE.Vector3(0, 0, 0.04));

        const angle = data.angle.radian;
        // Normalize distance: 0 (center) to 1 (full deflection)
        const ratio = Math.min(data.distance / JOYSTICK_RADIUS, 1.0);
        const speed = ratio * MAX_SPEED;

        // Call raw moveTo directly to bypass React state overhead during drag
        moveTo({
          x: v.x + Math.cos(angle) * speed,
          y: v.y,
          z: v.z - Math.sin(angle) * speed,
        });
      });

      // Update feedback only once when user stops dragging
      manager.on("end", () => {
        const store = useRobotStore.getState();
        const robot = store.robot;
        const name = store.stylusLinkName || "stylus_tip";
        if (!robot) return;
        const eeLink = robot.links[name];
        if (!eeLink) return;
        robot.updateMatrixWorld(true);
        const v = eeLink.localToWorld(new THREE.Vector3(0, 0, 0.04));
        
        const msg = `Joystick → (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
        setFeedback(msg);
        setIsSuccess(true);
        onStatusChange?.(msg, true);
      });
    });

    return () => {
      cancelled = true;
      if (manager) {
        manager.destroy();
        manager = null;
      }
    };
  }, []); // Run exactly once on mount to avoid rebuilding the DOM elements during drag

  // Seed starting position when robot loads
  useEffect(() => {
    const ee = getEePos();
    if (ee) {
      currentPos.current = ee;
      setYValue(ee.y);
    }
  }, [getEePos]);

  // Sync slider UI when the arm moves via other inputs (WASD keys, voice, click panel)
  const currentAngles = useRobotStore((s) => s.currentAngles);
  useEffect(() => {
    const ee = getEePos();
    if (ee) {
      setYValue(ee.y);
    }
  }, [currentAngles, getEePos]);

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newY = parseFloat(e.target.value);
    setYValue(newY);
    const ee = getEePos();
    if (ee) {
      doMove({ x: ee.x, y: newY, z: ee.z });
    }
  };

  // D-pad nudge fallback mapping to world coordinates
  const nudge = (axis: "x" | "y" | "z", dir: number) => {
    const ee = getEePos();
    if (ee) {
      doMove({
        x: ee.x + (axis === "x" ? STEP * dir : 0),
        y: ee.y + (axis === "y" ? STEP * dir : 0),
        z: ee.z + (axis === "z" ? STEP * dir : 0),
      });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Joystick control surface
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans">
          Drag the joystick to move X/Z · use the height slider for Y · D-pad fallback for discrete stepping.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {/* Top Row: X/Z plane Joystick & Y Height Slider side-by-side */}
        <div className="flex gap-2 items-center justify-between bg-[--steel-100]/30 p-3 rounded-t border border-[--steel-200]/60">
          {/* nipple.js joystick zone */}
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans text-center">X / Z plane</p>
            <div
              className="relative rounded-full border-2 border-[--steel-400] bg-[--steel-100] flex items-center justify-center shadow-inner"
              style={{ width: 110, height: 110, flexShrink: 0 }}
            >
              {/*
                This inner div is handed off entirely to nipplejs, which does its
                own direct DOM manipulation (appendChild/removeChild) inside it.
                React must never render conditional children into this same node —
                doing so causes React's reconciler and nipplejs's manual DOM writes
                to fight over the same child list, which surfaces as a
                "Failed to execute 'removeChild'" crash. Keep this node's contents
                100% owned by nipplejs.
              */}
              <div ref={joystickRef} className="w-full h-full" />

              {/* Loading indicator lives as a SIBLING overlay, not a child of the
                  nipplejs zone, so React can freely mount/unmount it without ever
                  touching nodes nipplejs manages. */}
              {!nippleReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[9px] text-[--steel-400] font-sans">loading…</span>
                </div>
              )}
            </div>
          </div>

          {/* Height Slider (Vertical Y in world space) */}
          <div className="flex flex-col items-center gap-1.5 border-l border-[--steel-200]/50 pl-3 pr-1 flex-1 justify-center">
            <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans text-center">Y Height</p>
            <div className="flex items-center gap-2 h-[110px] justify-center">
              <input
                type="range"
                min="0.05"
                max="0.85"
                step="0.01"
                value={yValue}
                onChange={handleYChange}
                className="cursor-pointer"
                style={{
                  writingMode: "vertical-lr" as any,
                  direction: "rtl" as any,
                  height: 90,
                  width: 18,
                  accentColor: "var(--copper)",
                }}
              />
              <span className="text-[10px] font-mono text-[--walnut-700] w-[40px] text-right font-bold">{yValue.toFixed(2)}m</span>
            </div>
          </div>
        </div>

        {/* Bottom Row: D-pad fallback mapped to world coords, stacked underneath */}
        <div className="flex flex-col items-center gap-1.5 bg-[--steel-100]/30 p-3 rounded-b border-x border-b border-[--steel-200]/60 border-t-0 justify-center">
          <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans text-center">D-Pad Step Nudges</p>
          
          <div className="flex gap-4 items-center">
            <div className="flex flex-col items-center">
              <button
                onClick={() => nudge("z", -1)}
                className="w-7 h-7 rounded-t border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-xs font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center shadow-sm"
                title="Move Forward (-Z)"
              >▲</button>
              <div className="flex gap-1.5">
                <button
                  onClick={() => nudge("x", -1)}
                  className="w-7 h-7 rounded-l border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-xs font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center shadow-sm"
                  title="Move Left (-X)"
                >◀</button>
                <button
                  onClick={() => nudge("z", 1)}
                  className="w-7 h-7 border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-xs font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center shadow-sm"
                  title="Move Backward (+Z)"
                >▼</button>
                <button
                  onClick={() => nudge("x", 1)}
                  className="w-7 h-7 rounded-r border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-xs font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center shadow-sm"
                  title="Move Right (+X)"
                >▶</button>
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5 border-l border-[--steel-200]/40 pl-4">
              <button
                onClick={() => nudge("y", 1)}
                className="w-9 h-6 rounded border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-[9px] font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center shadow-sm"
                title="Move Up (+Y)"
              >+Y</button>
              <button
                onClick={() => nudge("y", -1)}
                className="w-9 h-6 rounded border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-[9px] font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center shadow-sm"
                title="Move Down (-Y)"
              >-Y</button>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`p-2.5 rounded text-xs border font-mono ${isSuccess
            ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
            : "bg-red-50 border-red-200 text-red-700"
          }`}>
          {feedback}
        </div>
      )}
    </div>
  );
}