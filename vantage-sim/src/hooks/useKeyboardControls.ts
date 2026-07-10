"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { moveTo } from "../lib/moveTo";
import { useRobotStore } from "../state/robotStore";

export const useKeyboardControls = () => {
  const currentTarget = useRef<{ x: number; y: number; z: number } | null>(
    null
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Input box e type korar shomoy jate robot move na kore
      if (document.activeElement?.tagName === "INPUT") return;

      const store = useRobotStore.getState();
      const robot = store.robot;
      const stylusLinkName = store.stylusLinkName || "stylus_tip";

      // Robot load na hole command ignore korbe
      if (!robot) return;

      const eeLink = robot.links[stylusLinkName];
      if (!eeLink) return;

      // 3D scene theke ashol live position niye asha hocche
      robot.updateMatrixWorld(true);
      const pos = new THREE.Vector3();
      eeLink.getWorldPosition(pos);

      let { x, y, z } = currentTarget.current || {
        x: pos.x,
        y: pos.y,
        z: pos.z,
      };

      // Joystick ba onno kono vabe robot sore gele target abar sync korbe
      if (
        Math.abs(x - pos.x) > 0.05 ||
        Math.abs(y - pos.y) > 0.05 ||
        Math.abs(z - pos.z) > 0.05
      ) {
        x = pos.x;
        y = pos.y;
        z = pos.z;
      }

      const step = event.shiftKey ? 0.005 : 0.02;
      let moved = false;

      // Correct 3D Coordinate Axis Mappings
      switch (event.key.toLowerCase()) {
        case "w":
          z -= step;
          moved = true;
          break; // Z-axis minus = Samne
        case "s":
          z += step;
          moved = true;
          break; // Z-axis plus = Piche
        case "a":
          x -= step;
          moved = true;
          break; // X-axis minus = Bame
        case "d":
          x += step;
          moved = true;
          break; // X-axis plus = Dane
        case "q":
          y += step;
          moved = true;
          break; // Y-axis plus = Upore
        case "e":
          y -= step;
          moved = true;
          break; // Y-axis minus = Niche
        default:
          return;
      }

      if (moved) {
        currentTarget.current = { x, y, z };
        const result = moveTo(currentTarget.current);

        // Limit er baire gele target position reset kore dibe jate stuck na hoy
        if (!result.success) {
          console.warn("Keyboard move blocked:", result.reason);
          currentTarget.current = { x: pos.x, y: pos.y, z: pos.z };
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
};
