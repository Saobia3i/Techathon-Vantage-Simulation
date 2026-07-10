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
    let manager: any = null;

    import("nipplejs").then((mod) => {
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

        // Map 2D joystick polar angle to Three.js world X/Z:
        //   nipplejs angle 0 = right (+X), 90 = up (-Z in Three.js)
        doMoveRef.current({
          x: v.x + Math.cos(angle) * speed,
          y: v.y,           // Y height controlled by slider
          z: v.z - Math.sin(angle) * speed,
        });
      });
    });

    return () => {
      if (manager) {
        manager.destroy();
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

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newY = parseFloat(e.target.value);
    setYValue(newY);
    doMove({ ...currentPos.current, y: newY });
  };

  // D-pad nudge fallback mapping to world coordinates
  const nudge = (axis: "x" | "y" | "z", dir: number) => {
    const p = currentPos.current;
    doMove({
      x: p.x + (axis === "x" ? STEP * dir : 0),
      y: p.y + (axis === "y" ? STEP * dir : 0),
      z: p.z + (axis === "z" ? STEP * dir : 0),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-bold font-sans uppercase tracking-wider text-[--walnut-700] mb-1">
          Joystick control surface
        </p>
        <p className="text-[11px] text-[--steel-600] font-sans mb-3">
          Drag the joystick to move X/Z · use the height slider for Y.
          D-pad fallback available below.
        </p>
      </div>

      <div className="flex gap-4 items-start">
        {/* nipple.js joystick zone */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans">X / Z plane</p>
          <div
            ref={joystickRef}
            className="relative rounded-full border-2 border-[--steel-400] bg-[--steel-100]"
            style={{ width: 140, height: 140, flexShrink: 0 }}
          >
            {!nippleReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] text-[--steel-400] font-sans">loading…</span>
              </div>
            )}
          </div>
        </div>

        {/* Height Slider (Vertical Y in world space) */}
        <div className="flex flex-col items-center gap-2 pt-5">
          <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans">Y Height</p>
          <div className="flex items-center gap-3" style={{ height: 140 }}>
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
                height: 120,
                width: 24,
                accentColor: "var(--copper)",
              }}
            />
            <span className="text-[11px] font-mono text-[--walnut-700] w-10">{yValue.toFixed(2)}m</span>
          </div>
        </div>

        {/* D-pad fallback mapped to world coords */}
        <div className="flex flex-col items-center gap-1 pt-5">
          <p className="text-[10px] font-bold text-[--steel-600] uppercase tracking-wider font-sans mb-1">D-Pad</p>
          <button
            onClick={() => nudge("z", -1)}
            className="w-8 h-8 rounded border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-xs font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center"
            title="Move Forward (-Z)"
          >▲</button>
          <div className="flex gap-1">
            <button
              onClick={() => nudge("x", -1)}
              className="w-8 h-8 rounded border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-xs font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center"
              title="Move Left (-X)"
            >◀</button>
            <button
              onClick={() => nudge("z", 1)}
              className="w-8 h-8 rounded border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-xs font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center"
              title="Move Backward (+Z)"
            >▼</button>
            <button
              onClick={() => nudge("x", 1)}
              className="w-8 h-8 rounded border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-xs font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center"
              title="Move Right (+X)"
            >▶</button>
          </div>
          <div className="flex gap-1 mt-1">
            <button
              onClick={() => nudge("y", 1)}
              className="w-8 h-8 rounded border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-[10px] font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center"
              title="Move Up (+Y)"
            >+Y</button>
            <button
              onClick={() => nudge("y", -1)}
              className="w-8 h-8 rounded border border-[--steel-400] bg-[--panel] hover:border-[--copper] hover:bg-white text-[10px] font-bold text-[--walnut-700] cursor-pointer transition-all flex items-center justify-center"
              title="Move Down (-Y)"
            >-Y</button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`p-2.5 rounded text-xs border font-mono ${
          isSuccess
            ? "bg-[--safe-bg] border-[--safe-text]/30 text-[--safe-text]"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {feedback}
        </div>
      )}
    </div>
  );
}
