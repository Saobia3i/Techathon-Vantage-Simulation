"use client";

import { useEffect, useRef, useState } from "react";
import { moveToSmooth as moveTo } from "../lib/animateArm";

const INITIAL_POS = { x: 0.12, y: 0.04, z: 0.3 };

export default function JoystickControl() {
  const joystickRef = useRef<HTMLDivElement>(null);
  const currentPos = useRef(INITIAL_POS);
  const [zValue, setZValue] = useState(INITIAL_POS.z);

  useEffect(() => {
    if (!joystickRef.current) return;

    let manager: any = null;

    // Next.js SSR Fix: ব্রাউজারে রেন্ডার হওয়ার পরেই nipplejs ইমপোর্ট হবে
    import("nipplejs").then((nipplejsModule) => {
      // মডিউলটি সঠিকভাবে এক্সট্রাক্ট করা
      const nipple = nipplejsModule.default || nipplejsModule;

      // nipple.create ব্যবহার করে জয়স্টিক ইনিশিয়ালাইজ করা
      manager = nipple.create({
        zone: joystickRef.current as HTMLElement,
        mode: "static",
        position: { left: "50%", top: "50%" },
        color: "#3b82f6", // Tailwind blue-500
        size: 100,
      });

      manager.on("move", (evt: any, data: any) => {
        // সেফটি চেক: angle না পেলে লজিক রান করবে না
        if (!data || !data.angle) return;

        const angle = data.angle.radian;
        const distance = data.distance / 2000; // স্পিড কন্ট্রোল

        const newX = currentPos.current.x + Math.cos(angle) * distance;
        const newY = currentPos.current.y + Math.sin(angle) * distance;

        currentPos.current = { x: newX, y: newY, z: currentPos.current.z };
        moveTo(currentPos.current);
      });
    });

    // ক্লিনআপ ফাংশন: কম্পোনেন্ট আনমাউন্ট হলে জয়স্টিক ডেস্ট্রয় করবে
    return () => {
      if (manager) {
        manager.destroy();
      }
    };
  }, []);

  const handleZChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newZ = parseFloat(e.target.value);
    setZValue(newZ);
    currentPos.current.z = newZ;
    moveTo(currentPos.current);
  };

  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm flex items-center justify-between gap-6">
      <div className="flex-1 text-center">
        <h3 className="font-bold text-gray-800 mb-2">Joystick (X/Y) 🕹️</h3>
        {/* জয়স্টিক রেন্ডার হওয়ার জায়গা */}
        <div
          className="relative w-32 h-32 bg-gray-100 rounded-full mx-auto"
          ref={joystickRef}
        ></div>
      </div>

      <div className="flex flex-col items-center">
        <h3 className="font-bold text-gray-800 mb-2">Height (Z)</h3>
        <input
          type="range"
          min="0.1"
          max="0.6"
          step="0.01"
          value={zValue}
          onChange={handleZChange}
          className="w-32 accent-blue-500 cursor-pointer"
          style={{
            transform: "rotate(-90deg)",
            marginTop: "40px",
            marginBottom: "40px",
          }}
        />
      </div>
    </div>
  );
}
