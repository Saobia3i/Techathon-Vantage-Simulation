"use client";

import { useKeyboardControls } from "../hooks/useKeyboardControls";

export default function KeyboardController() {
  // হুকটি ইনিশিয়ালাইজ করলাম, এখন সে কীবোর্ড ইভেন্ট শোনা শুরু করবে
  useKeyboardControls();

  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm">
      <h3 className="font-bold text-gray-800 mb-3">Keyboard Controls ⌨️</h3>
      <ul className="text-sm text-gray-600 space-y-1">
        <li>
          <strong className="text-gray-900">W / S:</strong> Move Forward /
          Backward (Y Axis)
        </li>
        <li>
          <strong className="text-gray-900">A / D:</strong> Move Left / Right (X
          Axis)
        </li>
        <li>
          <strong className="text-gray-900">Q / E:</strong> Move Up / Down (Z
          Axis)
        </li>
        <li>
          <strong className="text-gray-900">Hold Shift:</strong> Fine-step (Slow
          movement)
        </li>
      </ul>
    </div>
  );
}
