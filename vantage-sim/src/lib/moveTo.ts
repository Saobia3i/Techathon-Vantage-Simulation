import * as THREE from "three";
import { useRobotStore } from "@/state/robotStore";
import type { Vector3Like, IKResult } from "@/types/robot";

/**
 * moveTo() — Damped Least Squares Inverse Kinematics Solver and Safety Validator.
 *
 * Runs Jacobian-based IK to find joint angles that bring the end-effector
 * to the target position, checks workspace bounds, convergence, and joint limits.
 *
 * CONTEXT.md §6.1 — do NOT change the function signature.
 */
export function moveTo(target: Vector3Like): IKResult {
  const store = useRobotStore.getState();
  const robot = store.robot;
  if (!robot) {
    return { success: false, reason: "robot_not_loaded", jointAngles: [] };
  }

  const jointNames = store.jointNames;
  if (jointNames.length === 0) {
    return { success: false, reason: "no_joints_in_store", jointAngles: [] };
  }

  // Identify movable joints (revolute or continuous) to solve for
  const activeIndices: number[] = [];
  const activeNames: string[] = [];
  jointNames.forEach((name, idx) => {
    const joint = robot.joints[name];
    if (
      joint &&
      (joint.jointType === "revolute" || joint.jointType === "continuous")
    ) {
      activeIndices.push(idx);
      activeNames.push(name);
    }
  });

  const stylusLinkName = store.stylusLinkName || "stylus_tip";
  const eeLink = robot.links[stylusLinkName];
  if (!eeLink) {
    return { success: false, reason: "stylus_link_not_found", jointAngles: [] };
  }

  // 1. Workspace bounds check (target is in the robot's local base frame)
  const targetVec = new THREE.Vector3(target.x, target.y, target.z);
  const targetDist = targetVec.length();

  const MAX_REACH = 0.95; // Max physical reach of the 6-DOF arm (sum of link lengths)
  const MIN_REACH = 0.10; // Avoid self-collision inside base cylinder

  if (targetDist > MAX_REACH) {
    return {
      success: false,
      reason: "out_of_bounds",
      jointAngles: jointNames.map((name) => (robot.joints[name]?.angle as number) ?? 0),
    };
  }

  if (targetDist < MIN_REACH) {
    return {
      success: false,
      reason: "unreachable",
      jointAngles: jointNames.map((name) => (robot.joints[name]?.angle as number) ?? 0),
    };
  }

  // Ground plane check: robot coordinates have Z as vertical up axis in URDF base frame.
  // Z must be >= -0.01m to prevent ground penetration.
  if (target.z < -0.01) {
    return {
      success: false,
      reason: "out_of_bounds",
      jointAngles: jointNames.map((name) => (robot.joints[name]?.angle as number) ?? 0),
    };
  }

  // Save current joint angles so we can revert on failure
  const originalAngles = jointNames.map((name) => (robot.joints[name]?.angle as number) ?? 0);

  // 2. Damped Least Squares IK solver
  const maxIterations = 80;
  const tolerance = 0.005; // 5mm touch tolerance (CONTEXT.md §6.4)
  const damping = 0.05; // Damping factor lambda

  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Ensure world coordinate matrices are updated
    robot.updateMatrixWorld(true);

    // Get current end-effector position in world space
    const eePos = new THREE.Vector3();
    eeLink.getWorldPosition(eePos);

    // Target is defined in robot local base frame. Convert to world space.
    const targetWorld = robot.localToWorld(new THREE.Vector3(target.x, target.y, target.z));

    const error = new THREE.Vector3().subVectors(targetWorld, eePos);
    if (error.length() < tolerance) {
      converged = true;
      break;
    }

    // Compute Jacobian matrix (3 x N) for translation
    const N = activeNames.length;
    const J: THREE.Vector3[] = []; // Column vectors

    for (let i = 0; i < N; i++) {
      const joint = robot.joints[activeNames[i]];

      // Joint axis in world coordinates
      const jointAxis = new THREE.Vector3()
        .copy(joint.axis)
        .applyQuaternion(joint.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();

      // Joint position in world coordinates
      const jointPos = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);

      // J_i = axis x (eePos - jointPos)
      const diff = new THREE.Vector3().subVectors(eePos, jointPos);
      const col = new THREE.Vector3().crossVectors(jointAxis, diff);
      J.push(col);
    }

    // Solve J * dTheta = error using Damped Least Squares:
    // dTheta = J^T * (J * J^T + lambda^2 * I)^-1 * error
    // Compute A = J * J^T (3x3 matrix)
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    for (let r = 0; r < 3; r++) {
      for (const col of J) {
        const valR = r === 0 ? col.x : r === 1 ? col.y : col.z;
        A[r][0] += valR * col.x;
        A[r][1] += valR * col.y;
        A[r][2] += valR * col.z;
      }
      // Add damping lambda^2 to diagonal
      A[r][r] += damping * damping;
    }

    // Invert the 3x3 matrix A using Cramer's rule
    const det =
      A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
      A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
      A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

    if (Math.abs(det) < 1e-9) {
      break; // Singular matrix, abort iteration
    }

    const invDet = 1.0 / det;
    const invA = [
      [
        (A[1][1] * A[2][2] - A[1][2] * A[2][1]) * invDet,
        (A[0][2] * A[2][1] - A[0][1] * A[2][2]) * invDet,
        (A[0][1] * A[1][2] - A[0][2] * A[1][1]) * invDet,
      ],
      [
        (A[1][2] * A[2][0] - A[1][0] * A[2][2]) * invDet,
        (A[0][0] * A[2][2] - A[0][2] * A[2][0]) * invDet,
        (A[0][2] * A[1][0] - A[0][0] * A[1][2]) * invDet,
      ],
      [
        (A[1][0] * A[2][1] - A[1][1] * A[2][0]) * invDet,
        (A[0][1] * A[2][0] - A[0][0] * A[2][1]) * invDet,
        (A[0][0] * A[1][1] - A[0][1] * A[1][0]) * invDet,
      ],
    ];

    // Compute temp = (J * J^T + lambda^2 * I)^-1 * error
    const temp = new THREE.Vector3(
      invA[0][0] * error.x + invA[0][1] * error.y + invA[0][2] * error.z,
      invA[1][0] * error.x + invA[1][1] * error.y + invA[1][2] * error.z,
      invA[2][0] * error.x + invA[2][1] * error.y + invA[2][2] * error.z
    );

    // Multiply J^T by temp to get dTheta
    // dTheta_i = J_i . temp
    for (let i = 0; i < N; i++) {
      const col = J[i];
      const dTheta = col.dot(temp);

      const joint = robot.joints[activeNames[i]];
      const nextAngle = ((joint.angle as number) ?? 0) + dTheta;
      robot.setJointValue(activeNames[i], nextAngle);
    }
  }

  // 3. Post-solver verification
  if (converged) {
    let limitsExceeded = false;
    let failedJointIndex = -1;

    for (let i = 0; i < jointNames.length; i++) {
      const name = jointNames[i];
      const joint = robot.joints[name];
      if (joint && joint.jointType === "revolute") {
        const angle = (joint.angle as number) ?? 0;
        if (angle < joint.limit.lower || angle > joint.limit.upper) {
          limitsExceeded = true;
          // Find 1-based index in the sequence of joints (e.g. joint1 is index 1, joint2 is 2...)
          // The name format is typically 'jointN', so we can extract it or use order in jointNames
          const nameMatch = name.match(/joint(\d+)/);
          if (nameMatch) {
            failedJointIndex = parseInt(nameMatch[1], 10);
          } else {
            failedJointIndex = i + 1;
          }
          break;
        }
      }
    }

    if (limitsExceeded) {
      // Revert angles to original positions
      jointNames.forEach((name, idx) => {
        robot.setJointValue(name, originalAngles[idx]);
      });
      robot.updateMatrixWorld(true);
      return {
        success: false,
        reason: `joint_${failedJointIndex}_out_of_limits`,
        jointAngles: originalAngles,
      };
    }

    // Success! Save current angles to store and return
    const finalAngles = jointNames.map((name) => (robot.joints[name]?.angle as number) ?? 0);
    store.setCurrentAngles(finalAngles);
    return {
      success: true,
      jointAngles: finalAngles,
    };
  } else {
    // Revert angles on convergence failure
    jointNames.forEach((name, idx) => {
      robot.setJointValue(name, originalAngles[idx]);
    });
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
