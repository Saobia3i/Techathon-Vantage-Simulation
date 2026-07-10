import * as THREE from "three";

/**
 * PBR Steel Material Preset.
 * Used for long link segments of the robot arm.
 */
export const STEEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xc4c9d0,
  metalness: 0.85,
  roughness: 0.35,
  name: "vantage_steel",
});

/**
 * PBR Bronze Material Preset.
 * Used for joint collars and pivot points.
 */
export const BRONZE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x8b5e3c,
  metalness: 0.9,
  roughness: 0.25,
  name: "vantage_bronze",
});
