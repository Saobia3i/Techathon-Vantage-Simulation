import * as THREE from "three";
import { useRobotStore } from "@/state/robotStore";
import type { Vector3Like, IKResult } from "@/types/robot";

/**
 * moveTo() — Damped Least Squares Inverse Kinematics Solver and Safety Validator.
 *
 * TARGET COORDINATE FRAME: THREE.JS WORLD SPACE
 *   - All callers (controls, PIN sequencer, voice) pass world-space (x,y,z).
 *   - The robot is mounted in the scene with robot.rotation.x = -PI/2 (Z-up URDF → Y-up Three.js).
 *   - We operate entirely in world space: no localToWorld conversion needed in the solver loop.
 *
 * Workspace check:
 *   - Computed as Euclidean distance from the robot's world origin to the target.
 *
 * CONTEXT.md §6.1 — do NOT change the function signature.
 */
export function moveTo(target: Vector3Like): IKResult {
  console.log("[moveTo] Target (world):", target);

  const store = useRobotStore.getState();
  const robot = store.robot;
  if (!robot) {
    console.warn("[moveTo] Failed: Robot not loaded in store");
    return { success: false, reason: "robot_not_loaded", jointAngles: [] };
  }

  const jointNames = store.jointNames;
  if (jointNames.length === 0) {
    console.warn("[moveTo] Failed: No joints in store");
    return { success: false, reason: "no_joints_in_store", jointAngles: [] };
  }

  // Identify movable joints (revolute or continuous)
  const activeNames: string[] = [];
  jointNames.forEach((name) => {
    const joint = robot.joints[name];
    if (joint && (joint.jointType === "revolute" || joint.jointType === "continuous")) {
      activeNames.push(name);
    }
  });

  const stylusLinkName = store.stylusLinkName || "stylus_tip";
  const eeLink = robot.links[stylusLinkName];
  if (!eeLink) {
    console.warn(`[moveTo] Failed: Stylus link "${stylusLinkName}" not found`);
    return { success: false, reason: "stylus_link_not_found", jointAngles: [] };
  }

  // ── 1. Workspace bounds check ────────────────────────────────────────────
  // Get the robot's world position (its root in Three.js scene)
  robot.updateMatrixWorld(true);
  const robotWorldPos = new THREE.Vector3().setFromMatrixPosition(robot.matrixWorld);
  const targetVec = new THREE.Vector3(target.x, target.y, target.z);
  const targetDist = targetVec.distanceTo(robotWorldPos);

  // Link lengths from URDF: 0.14+0.22+0.18+0.15+0.12+0.07 = 0.88m + base offsets
  const MAX_REACH = 0.90;
  const MIN_REACH = 0.05;

  if (targetDist > MAX_REACH) {
    console.warn(`[moveTo] Out of reach: ${targetDist.toFixed(3)}m > ${MAX_REACH}m`);
    return {
      success: false,
      reason: "out_of_bounds",
      jointAngles: jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0),
    };
  }

  if (targetDist < MIN_REACH) {
    console.warn(`[moveTo] Too close to base: ${targetDist.toFixed(3)}m < ${MIN_REACH}m`);
    return {
      success: false,
      reason: "unreachable",
      jointAngles: jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0),
    };
  }

  // Ground plane guard (Y < 0 in Three.js world = below floor)
  if (target.y < -0.02) {
    console.warn(`[moveTo] Below ground: y=${target.y.toFixed(3)}`);
    return {
      success: false,
      reason: "out_of_bounds",
      jointAngles: jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0),
    };
  }

  // Save original angles so we can revert on failure
  const originalAngles = jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0);

  // ── 2. Damped Least Squares IK Solver ───────────────────────────────────
  const maxIterations = 150;
  const tolerance = 0.005;   // 5mm convergence threshold (CONTEXT.md §6.4)
  const damping    = 0.08;   // DLS damping factor λ — higher = more stable, less agile
  const maxStep    = 0.04;   // Max error step per iteration (prevents divergence)

  let converged = false;

  // Target is already in THREE.js world space — no conversion needed
  const targetWorld = new THREE.Vector3(target.x, target.y, target.z);

  for (let iter = 0; iter < maxIterations; iter++) {
    robot.updateMatrixWorld(true);

    // Current EE position in world space
    const eePos = new THREE.Vector3();
    eeLink.getWorldPosition(eePos);

    const error = new THREE.Vector3().subVectors(targetWorld, eePos);
    const errorNorm = error.length();

    if (errorNorm < tolerance) {
      converged = true;
      console.log(`[moveTo] Converged in ${iter} iters — error: ${(errorNorm * 1000).toFixed(2)}mm`);
      break;
    }

    // Clamp step size to avoid overshoot and divergence
    if (errorNorm > maxStep) {
      error.normalize().multiplyScalar(maxStep);
    }

    // ── Build Jacobian (3 × N), all in world space ──────────────────────
    const N = activeNames.length;
    const J: THREE.Vector3[] = [];

    for (let i = 0; i < N; i++) {
      const joint = robot.joints[activeNames[i]];

      // Joint axis in world space
      const jointAxis = new THREE.Vector3()
        .copy(joint.axis)
        .applyQuaternion(joint.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();

      // Joint origin in world space
      const jointPos = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);

      // J_i = axis × (eePos − jointPos)
      const diff = new THREE.Vector3().subVectors(eePos, jointPos);
      J.push(new THREE.Vector3().crossVectors(jointAxis, diff));
    }

    // ── Compute A = J·J^T + λ²·I  (3×3) ────────────────────────────────
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ] as number[][];

    for (let r = 0; r < 3; r++) {
      for (const col of J) {
        const valR = r === 0 ? col.x : r === 1 ? col.y : col.z;
        A[r][0] += valR * col.x;
        A[r][1] += valR * col.y;
        A[r][2] += valR * col.z;
      }
      A[r][r] += damping * damping;
    }

    // ── Invert A (3×3) via Cramer's rule ────────────────────────────────
    const det =
      A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
      A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
      A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

    if (Math.abs(det) < 1e-9) {
      console.warn(`[moveTo] Singular Jacobian at iter ${iter} — aborting`);
      break;
    }

    const d = 1.0 / det;
    const invA = [
      [(A[1][1]*A[2][2]-A[1][2]*A[2][1])*d, (A[0][2]*A[2][1]-A[0][1]*A[2][2])*d, (A[0][1]*A[1][2]-A[0][2]*A[1][1])*d],
      [(A[1][2]*A[2][0]-A[1][0]*A[2][2])*d, (A[0][0]*A[2][2]-A[0][2]*A[2][0])*d, (A[0][2]*A[1][0]-A[0][0]*A[1][2])*d],
      [(A[1][0]*A[2][1]-A[1][1]*A[2][0])*d, (A[0][1]*A[2][0]-A[0][0]*A[2][1])*d, (A[0][0]*A[1][1]-A[0][1]*A[1][0])*d],
    ];

    // ── temp = A⁻¹ · error ──────────────────────────────────────────────
    const temp = new THREE.Vector3(
      invA[0][0]*error.x + invA[0][1]*error.y + invA[0][2]*error.z,
      invA[1][0]*error.x + invA[1][1]*error.y + invA[1][2]*error.z,
      invA[2][0]*error.x + invA[2][1]*error.y + invA[2][2]*error.z,
    );

    // ── dTheta = J^T · temp  →  apply to each joint ─────────────────────
    for (let i = 0; i < N; i++) {
      const dTheta = J[i].dot(temp);
      const joint = robot.joints[activeNames[i]];
      const next = ((joint.angle as number) ?? 0) + dTheta;
      robot.setJointValue(activeNames[i], next);
    }
  }

  // ── 3. Post-convergence checks ───────────────────────────────────────────
  if (converged) {
    let limitsExceeded = false;
    let failedJoint = "";

    for (const name of jointNames) {
      const joint = robot.joints[name];
      if (joint && joint.jointType === "revolute") {
        const angle = (joint.angle as number) ?? 0;
        if (angle < joint.limit.lower || angle > joint.limit.upper) {
          limitsExceeded = true;
          failedJoint = name;
          console.warn(`[moveTo] Limit violation: ${name} angle=${angle.toFixed(3)} outside [${joint.limit.lower.toFixed(3)}, ${joint.limit.upper.toFixed(3)}]`);
          break;
        }
      }
    }

    if (limitsExceeded) {
      jointNames.forEach((n, i) => robot.setJointValue(n, originalAngles[i]));
      robot.updateMatrixWorld(true);
      return {
        success: false,
        reason: `${failedJoint}_out_of_limits`,
        jointAngles: originalAngles,
      };
    }

    const finalAngles = jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0);
    store.setCurrentAngles(finalAngles);
    console.log("[moveTo] ✓ Success:", finalAngles.map(a => a.toFixed(3)));
    return { success: true, jointAngles: finalAngles };

  } else {
    // Revert on failure
    console.warn("[moveTo] ✗ Did not converge — reverting angles");
    jointNames.forEach((n, i) => robot.setJointValue(n, originalAngles[i]));
    robot.updateMatrixWorld(true);
    return {
      success: false,
      reason: "ik_did_not_converge",
      jointAngles: originalAngles,
    };
  }
}

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as any).moveTo = moveTo;
}
