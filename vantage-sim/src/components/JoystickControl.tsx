"use client";

import { useEffect, useRef, useState } from "react";
import { moveTo } from "../lib/moveTo";
import { useRobotStore } from "../state/robotStore";
import * as THREE from "three";

const INITIAL_POS = { x: 0.12, y: 0.28, z: 0.3 };

export default function JoystickControl() {
  const joystickRef = useRef<HTMLDivElement>(null);
  const [yValue, setYValue] = useState(INITIAL_POS.y);

  useEffect(() => {
    if (!joystickRef.current) return;

    let manager: any = null;

    // Next.js SSR Fix: ব্রাউজারে রেন্ডার হওয়ার পরেই nipplejs ইমপোর্ট হবে
    import("nipplejs").then((nipplejsModule) => {
      // মডিউলটি সঠিকভাবে এক্সট্রাক্ট করা
      const nipple = nipplejsModule.default || nipplejsModule;

      const JOYSTICK_RADIUS = 50; // half of size:100
      const MAX_SPEED = 0.018;    // max meters per event at full deflection

      // nipple.create ব্যবহার করে জয়স্টিক ইনিশিয়ালাইজ করা
      manager = nipple.create({
        zone: joystickRef.current as HTMLElement,
        mode: "static",
        position: { left: "50%", top: "50%" },
        color: "#3b82f6", // Tailwind blue-500
        size: 100,
      });

      manager.on("move", (_evt: any, data: any) => {
        // সেফটি চেক: angle না পেলে লজিক রান করবে না
        if (!data || !data.angle) return;

        // Read LIVE EE world position every event to prevent drift
        const store = useRobotStore.getState();
        const robot = store.robot;
        const linkName = store.stylusLinkName || "stylus_tip";
        if (!robot) return;
        const eeLink = robot.links[linkName];
        if (!eeLink) return;
        robot.updateMatrixWorld(true);
        const v = eeLink.localToWorld(new THREE.Vector3(0, 0, 0.04));

        const angle = data.angle.radian;
        // Normalize distance 0→1
        const ratio = Math.min(data.distance / JOYSTICK_RADIUS, 1.0);
        const speed = ratio * MAX_SPEED;

        // Correct 3D mapping:
        //   nipplejs angle 0 = right → +X in Three.js world
        //   nipplejs angle 90 = up   → -Z in Three.js world (forward)
        moveTo({
          x: v.x + Math.cos(angle) * speed,
          y: v.y,   // Y (height) controlled by slider
          z: v.z - Math.sin(angle) * speed,
        });
      });
    });

    // ক্লিনআপ ফাংশন: কম্পোনেন্ট আনমাউন্ট হলে জয়স্টিক ডেস্ট্রয় করবে
    return () => {
      if (manager) {
        manager.destroy();
      }
    };
  }, []);

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newY = parseFloat(e.target.value);
    setYValue(newY);

    // Read live EE position and update only Y
    const store = useRobotStore.getState();
    const robot = store.robot;
    const linkName = store.stylusLinkName || "stylus_tip";
    if (!robot) return;
    const eeLink = robot.links[linkName];
    if (!eeLink) return;
    robot.updateMatrixWorld(true);
    const v = eeLink.localToWorld(new THREE.Vector3(0, 0, 0.04));
    moveTo({ x: v.x, y: newY, z: v.z });
  };

  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm flex items-center justify-between gap-6">
      <div className="flex-1 text-center">
        <h3 className="font-bold text-gray-800 mb-2">Joystick (X/Z) 🕹️</h3>
        <p className="text-xs text-gray-500 mb-1">Drag to move X / Z plane</p>
        {/* জয়স্টিক রেন্ডার হওয়ার জায়গা */}
        <div
          className="relative w-32 h-32 bg-gray-100 rounded-full mx-auto"
          ref={joystickRef}
        ></div>
      </div>

      <div className="flex flex-col items-center">
        <h3 className="font-bold text-gray-800 mb-2">Height (Y)</h3>
        <input
          type="range"
          min="0.05"
          max="0.85"
          step="0.01"
          value={yValue}
          onChange={handleYChange}
          className="w-32 accent-blue-500 cursor-pointer"
          style={{
            transform: "rotate(-90deg)",
            marginTop: "40px",
            marginBottom: "40px",
          }}
        />
        <span className="text-xs font-mono text-gray-600">{yValue.toFixed(2)}m</span>
      </div>
    </div>
  );
}
