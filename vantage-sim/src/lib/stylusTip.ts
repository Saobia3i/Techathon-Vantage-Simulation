import * as THREE from "three";

export const STYLUS_TIP_LOCAL_OFFSET = new THREE.Vector3(0, 0, 0.04);

export function getStylusTipWorldPositionFromLink(link: any): THREE.Vector3 | null {
  if (!link) return null;
  return link.localToWorld(STYLUS_TIP_LOCAL_OFFSET.clone());
}

export function getStylusTipWorldPosition(
  robot: any,
  stylusLinkName?: string | null
): THREE.Vector3 | null {
  if (!robot) return null;
  const link = robot.links[stylusLinkName || "stylus_tip"];
  if (!link) return null;
  robot.updateMatrixWorld(true);
  return getStylusTipWorldPositionFromLink(link);
}
