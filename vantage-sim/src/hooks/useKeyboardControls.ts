import { useEffect, useRef } from "react";
import { moveToSmooth as moveTo } from "../lib/animateArm";

// একটি ইনিশিয়াল কারেন্ট পজিশন ধরে নিচ্ছি (প্যানেলের ১ নম্বর বোতামের কোঅর্ডিনেট)
const INITIAL_POS = { x: 0.12, y: 0.04, z: 0.3 };

export const useKeyboardControls = () => {
  const currentPos = useRef(INITIAL_POS);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Shift বাটন চেপে ধরলে মুভমেন্ট খুব অল্প হবে (ফাইন-স্টেপ)
      const step = event.shiftKey ? 0.005 : 0.02;
      let { x, y, z } = currentPos.current;

      switch (event.key.toLowerCase()) {
        case "w":
          y += step;
          break; // Y অক্ষে সামনে
        case "s":
          y -= step;
          break; // Y অক্ষে পেছনে
        case "a":
          x -= step;
          break; // X অক্ষে বামে
        case "d":
          x += step;
          break; // X অক্ষে ডানে
        case "q":
          z += step;
          break; // Z অক্ষে উপরে
        case "e":
          z -= step;
          break; // Z অক্ষে নিচে
        default:
          return; // অন্য কোনো বাটন চাপলে কিছুই হবে না
      }

      // নতুন পজিশনটা সেভ করে moveTo কল করা হচ্ছে
      currentPos.current = { x, y, z };
      const result = moveTo(currentPos.current);

      console.log(
        `Keyboard Target: X:${x.toFixed(3)}, Y:${y.toFixed(3)}, Z:${z.toFixed(
          3
        )} | Success: ${result.success}`
      );
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
};
