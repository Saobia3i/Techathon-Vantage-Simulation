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

const DEFAULT_KEY_CONFIG: Record<string, { x: number; y: number; z: number }> = {
  "1": { x: 0.10, y: 0.04, z: 0.28 },
  "2": { x: 0.13, y: 0.04, z: 0.28 },
  "3": { x: 0.16, y: 0.04, z: 0.28 },
  "4": { x: 0.10, y: 0.04, z: 0.31 },
  "5": { x: 0.13, y: 0.04, z: 0.31 },
  "6": { x: 0.16, y: 0.04, z: 0.31 },
};

const KEY_FACE_SIZE = 0.024;
const KEY_DEPTH = 0.012;
const PANEL_MARGIN = 0.035;
const PANEL_THICKNESS = 0.006;
const TARGET_FACE_CLEARANCE = 0.004;

function makeDigitLabel(digit: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(18, 18, 92, 92, 16);
  ctx.fill();
  ctx.fillStyle = "#2A1D14";
  ctx.font = "700 62px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(digit, 64, 68);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(KEY_FACE_SIZE * 0.82, KEY_FACE_SIZE * 0.82), material);
  label.rotation.x = Math.PI / 2;
  label.renderOrder = 10;
  return label;
}

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

  const entries = Object.entries(keyConfig).sort(([a], [b]) => Number(a) - Number(b));
  const xs = entries.map(([, pos]) => pos.x);
  const ys = entries.map(([, pos]) => pos.y);
  const zs = entries.map(([, pos]) => pos.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2;
  const centerY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const centerZ = (minZ + maxZ) / 2;
  const panelWidth = maxX - minX + PANEL_MARGIN * 2;
  const panelHeight = maxZ - minZ + PANEL_MARGIN * 2;

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(panelWidth, PANEL_THICKNESS, panelHeight),
    new THREE.MeshStandardMaterial({
      color: 0x2a1d14,
      roughness: 0.55,
      metalness: 0.18,
    }),
  );
  panel.name = "key_panel_backplate";
  panel.position.set(centerX, centerY + PANEL_THICKNESS / 2, centerZ);
  panel.castShadow = true;
  panel.receiveShadow = true;
  panelGroup.add(panel);

  const worldKeyPositions: Record<string, { x: number; y: number; z: number }> = {};

  entries.forEach(([digit, pos], i) => {
    const key = new THREE.Mesh(
      new THREE.BoxGeometry(KEY_FACE_SIZE, KEY_DEPTH, KEY_FACE_SIZE),
      new THREE.MeshStandardMaterial({
        color: KEY_COLORS[i % KEY_COLORS.length],
        roughness: 0.32,
        metalness: 0.25,
        emissive: KEY_COLORS[i % KEY_COLORS.length],
        emissiveIntensity: 0.08,
      }),
    );
    key.name = `key_${digit}`;
    key.userData.digit = digit;
    key.position.set(pos.x, centerY - KEY_DEPTH / 2, pos.z);
    key.castShadow = true;
    key.receiveShadow = true;
    panelGroup.add(key);

    const label = makeDigitLabel(digit);
    if (label) {
      label.position.set(pos.x, centerY - KEY_DEPTH - 0.001, pos.z);
      panelGroup.add(label);
    }
  });

  robot.updateMatrixWorld(true);

  entries.forEach(([digit, pos]) => {
    const targetLocal = new THREE.Vector3(pos.x, centerY - KEY_DEPTH - TARGET_FACE_CLEARANCE, pos.z);
    const targetWorld = panelGroup.localToWorld(targetLocal.clone());
    worldKeyPositions[digit] = {
      x: targetWorld.x,
      y: targetWorld.y,
      z: targetWorld.z,
    };
  });

  useRobotStore.getState().setKeyPositions(worldKeyPositions);
  console.log("[renderKeyPanel] Key face targets stored:", worldKeyPositions);
}
