/**
 * renderKeyPanel — places 6 coloured key boxes in the Three.js scene.
 *
 * Keys are parented to the robot's root object (NOT the scene root) so they
 * inherit the arm's base-frame transform. Coordinates in key.config.json are
 * relative to the arm base frame — CONTEXT.md §6.3.
 */
import * as THREE from "three";
import type { URDFRobot } from "urdf-loader";
import { useRobotStore } from "@/state/robotStore";

const KEY_COLORS = [
  0xff4d6d, // key 1 — red-pink
  0xff8c42, // key 2 — orange
  0xffe14d, // key 3 — yellow
  0x4dffb8, // key 4 — mint
  0x4dc3ff, // key 5 — sky blue
  0xb44dff, // key 6 — violet
];

export async function renderKeyPanel(
  scene: THREE.Scene,
  robot: URDFRobot
): Promise<void> {
  let keyConfig: Record<string, { x: number; y: number; z: number }>;

  try {
    const res = await fetch("/robot/key.config.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    keyConfig = await res.json();
  } catch (err) {
    console.error("[renderKeyPanel] Failed to load key.config.json:", err);
    return;
  }

  // Parent to robot root — coordinates are base-frame, not world-absolute
  const panelGroup = new THREE.Group();
  panelGroup.name = "key_panel";
  robot.add(panelGroup);

  const worldKeyPositions: Record<string, { x: number; y: number; z: number }> = {};
  const entries = Object.entries(keyConfig);

  entries.forEach(([digit, pos], i) => {
    // Key geometry — 2 cm × 2 cm face, 1 cm deep (adjust if arm scale differs)
    const geometry = new THREE.BoxGeometry(0.02, 0.02, 0.01);
    const material = new THREE.MeshStandardMaterial({
      color: KEY_COLORS[i % KEY_COLORS.length],
      roughness: 0.3,
      metalness: 0.4,
      emissive: KEY_COLORS[i % KEY_COLORS.length],
      emissiveIntensity: 0.15,
    });
    const key = new THREE.Mesh(geometry, material);
    key.position.set(pos.x, pos.y, pos.z);
    key.name = `key_${digit}`;
    key.userData.digit = digit;

    panelGroup.add(key);
  });

  // Force update matrix world of the robot and key panel hierarchy
  robot.updateMatrixWorld(true);

  // Retrieve exact world positions for use in the world-space moveTo() IK solver
  panelGroup.children.forEach((child) => {
    const keyMesh = child as THREE.Mesh;
    const digit = keyMesh.userData.digit;
    if (digit) {
      const worldPos = new THREE.Vector3();
      keyMesh.getWorldPosition(worldPos);
      worldKeyPositions[digit] = {
        x: worldPos.x,
        y: worldPos.y,
        z: worldPos.z,
      };
    }
  });

  // Persist the exact world key positions to the store for Dashboard/Voice/PIN controls
  const store = useRobotStore.getState();
  store.setKeyPositions(worldKeyPositions);
  console.log("[renderKeyPanel] World-space key positions stored successfully:", worldKeyPositions);

  console.log(
    `[renderKeyPanel] Rendered ${entries.length} keys parented to robot root.`
  );
}
