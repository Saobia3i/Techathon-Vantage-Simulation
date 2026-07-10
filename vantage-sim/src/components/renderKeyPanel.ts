import * as THREE from "three";
import type { URDFRobot } from "urdf-loader";
import { useRobotStore } from "@/state/robotStore";

const KEY_COLORS = [
  0xff4d6d,
  0xff8c42,
  0xffe14d,
  0x4dffb8,
  0x4dc3ff,
  0xb44dff,
];

const KEY_SIZE = 0.038;
const KEY_DEPTH = 0.014;
const TARGET_SURFACE_OFFSET = 0.018;

const DEFAULT_KEY_CONFIG: Record<string, { x: number; y: number; z: number }> = {
  "1": { x: 0.34, y: -0.20, z: 0.24 },
  "2": { x: 0.40, y: -0.20, z: 0.24 },
  "3": { x: 0.46, y: -0.20, z: 0.24 },
  "4": { x: 0.34, y: -0.20, z: 0.30 },
  "5": { x: 0.40, y: -0.20, z: 0.30 },
  "6": { x: 0.46, y: -0.20, z: 0.30 },
};

export async function renderKeyPanel(
  scene: THREE.Scene,
  robot: URDFRobot
): Promise<void> {
  let keyConfig = DEFAULT_KEY_CONFIG;

  try {
    const res = await fetch(`/robot/key.config.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const loadedConfig = await res.json();
    if (loadedConfig && Object.keys(loadedConfig).length === 6) {
      keyConfig = loadedConfig;
    }
  } catch (err) {
    console.warn("[renderKeyPanel] Using built-in key layout because key.config.json failed:", err);
  }

  const existingPanel = robot.getObjectByName("key_panel");
  if (existingPanel) {
    robot.remove(existingPanel);
  }

  const panelGroup = new THREE.Group();
  panelGroup.name = "key_panel";
  robot.add(panelGroup);

  const worldKeyPositions: Record<string, { x: number; y: number; z: number }> = {};
  const entries = Object.entries(keyConfig);

  entries.forEach(([digit, pos], i) => {
    const geometry = new THREE.BoxGeometry(KEY_SIZE, KEY_SIZE, KEY_DEPTH);
    const material = new THREE.MeshStandardMaterial({
      color: KEY_COLORS[i % KEY_COLORS.length],
      roughness: 0.3,
      metalness: 0.4,
      emissive: KEY_COLORS[i % KEY_COLORS.length],
      emissiveIntensity: 0.15,
    });

    const key = new THREE.Mesh(geometry, material);
    key.position.set(pos.x, pos.y, pos.z);
    key.rotation.x = Math.PI / 2;
    key.name = `key_${digit}`;
    key.userData.digit = digit;
    panelGroup.add(key);
  });

  robot.updateMatrixWorld(true);

  panelGroup.children.forEach((child) => {
    const keyMesh = child as THREE.Mesh;
    const digit = keyMesh.userData.digit;
    if (!digit) return;

    const worldPos = new THREE.Vector3();
    keyMesh.getWorldPosition(worldPos);

    const targetLocal = keyMesh.position.clone();
    targetLocal.y -= TARGET_SURFACE_OFFSET;
    const targetWorld = panelGroup.localToWorld(targetLocal);

    worldKeyPositions[digit] = {
      x: targetWorld.x,
      y: targetWorld.y,
      z: targetWorld.z,
    };
  });

  useRobotStore.getState().setKeyPositions(worldKeyPositions);
  console.log("[renderKeyPanel] World-space key positions stored:", worldKeyPositions);
  console.log(`[renderKeyPanel] Rendered ${entries.length} keys on reachable keypad.`);
}
