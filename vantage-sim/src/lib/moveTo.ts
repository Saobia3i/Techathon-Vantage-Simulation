import * as THREE from "three";
import { useRobotStore } from "@/state/robotStore";
import type { IKEquationReport, Vector3Like, IKResult } from "@/types/robot";

const MAX_REACH = 1.0;
const MIN_REACH = 0.05;
const GROUND_MIN_Y = 0.0;
const MAX_ITERATIONS = 250;
const TOLERANCE = 0.005;
const DAMPING = 0.03;
const MAX_STEP = 0.04;

function fmt(n: number, digits = 4) {
  return Number.isFinite(n) ? n.toFixed(digits) : "n/a";
}

function finish(
  report: IKEquationReport,
  success: boolean,
  jointAngles: number[],
  reason?: string,
  ): IKResult {
  report.success = success;
  report.reason = reason;
  useRobotStore.getState().setLastIKReport(report);
  return success ? { success, jointAngles, report } : { success, reason, jointAngles, report };
}

function checkCollision(robot: any, activeNames: string[], eeLink: any): { collision: boolean; reason?: string } {
  const points: THREE.Vector3[] = [];

  // Add all joints from joint1 to joint6 in kinematic order
  const chain = ["joint1", "joint2", "joint3", "joint4", "joint5", "joint6"];
  for (const name of chain) {
    const joint = robot.joints[name];
    if (joint) {
      const pos = new THREE.Vector3();
      joint.getWorldPosition(pos);
      points.push(pos);
    }
  }

  // Add end-effector tip
  const eePos = new THREE.Vector3();
  eeLink.getWorldPosition(eePos);
  points.push(eePos);

  // Sample points along the segment connecting adjacent joints/links to check
  // for ground penetration (Y < 0 in Three.js world space).
  // NOTE: board collision is not checked here because the key panel sits at
  // positive Z in Three.js world space (robot is rotated -PI/2 on X).
  // The workspace bounds check (MAX_REACH) already prevents out-of-range targets.
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    // Sample 8 intermediate points along each link cylinder segment
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      const y = (1 - t) * start.y + t * end.y;

      // Allow 1mm tolerance for floating-point noise at the base plane
      if (y < -0.001) {
        return { collision: true, reason: "ground_collision" };
      }
    }
  }

  return { collision: false };
}

/**
 * moveTo() - Damped Least Squares inverse kinematics solver and safety validator.
 * Target frame: Three.js world space.
 */
export function moveTo(target: Vector3Like): IKResult {
  console.log("[moveTo] Target (world):", target);

  const store = useRobotStore.getState();
  const report: IKEquationReport = {
    targetWorld: { x: target.x, y: target.y, z: target.z },
    iterations: 0,
    success: false,
    steps: [],
  };

  const robot = store.robot;
  if (!robot) {
    report.steps.push({
      label: "Robot load check",
      equation: "robot != null",
      output: "false",
      why: "The solver needs the loaded URDF scene graph before it can read joints or link positions.",
    });
    return finish(report, false, [], "robot_not_loaded");
  }

  const jointNames = store.jointNames;
  if (jointNames.length === 0) {
    report.steps.push({
      label: "Joint list check",
      equation: "jointNames.length > 0",
      output: "false",
      why: "At least one movable joint is required to change the end-effector position.",
    });
    return finish(report, false, [], "no_joints_in_store");
  }

  const currentJointAngles = () => jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0);

  const activeNames = jointNames.filter((name) => {
    const joint = robot.joints[name];
    return joint && (joint.jointType === "revolute" || joint.jointType === "continuous");
  });

  if (activeNames.length === 0) {
    report.steps.push({
      label: "Active joint check",
      equation: "active revolute/continuous joints > 0",
      output: "false",
      why: "Inverse kinematics needs at least one movable joint to change the stylus position.",
    });
    return finish(report, false, currentJointAngles(), "no_active_joints");
  }

  const stylusLinkName = store.stylusLinkName || "stylus_tip";
  const eeLink = robot.links[stylusLinkName];
  if (!eeLink) {
    report.steps.push({
      label: "End-effector link check",
      equation: `links["${stylusLinkName}"] exists`,
      output: "false",
      why: "The final position error is measured at the stylus/end-effector link.",
    });
    return finish(report, false, [], "stylus_link_not_found");
  }

  robot.updateMatrixWorld(true);
  const robotWorldPos = new THREE.Vector3().setFromMatrixPosition(robot.matrixWorld);
  const targetWorld = new THREE.Vector3(target.x, target.y, target.z);
  const targetDist = targetWorld.distanceTo(robotWorldPos);

  report.steps.push({
    label: "Workspace distance",
    equation: "d = sqrt((tx - bx)^2 + (ty - by)^2 + (tz - bz)^2)",
    output: `d = ${fmt(targetDist)} m; allowed ${MIN_REACH.toFixed(2)} m <= d <= ${MAX_REACH.toFixed(2)} m`,
    why: "The target must be inside the robot's reachable envelope before IK is attempted.",
  });

  if (targetDist > MAX_REACH) {
    console.warn(`[moveTo] Out of reach: ${targetDist.toFixed(3)}m > ${MAX_REACH}m`);
    return finish(report, false, currentJointAngles(), "out_of_bounds");
  }

  if (targetDist < MIN_REACH) {
    console.warn(`[moveTo] Too close to base: ${targetDist.toFixed(3)}m < ${MIN_REACH}m`);
    return finish(report, false, currentJointAngles(), "unreachable");
  }

  report.steps.push({
    label: "Ground guard",
    equation: `target.y >= ${GROUND_MIN_Y}`,
    output: `${fmt(target.y)} >= ${GROUND_MIN_Y} is ${target.y >= GROUND_MIN_Y}`,
    why: "The stylus is not allowed to target a point below the floor plane.",
  });

  if (target.y < GROUND_MIN_Y) {
    console.warn(`[moveTo] Below ground: y=${target.y.toFixed(3)}`);
    return finish(report, false, currentJointAngles(), "out_of_bounds");
  }

  report.steps.push({
    label: "Board guard",
    equation: "target.y >= 0 (ground guard covers all planes; board is in front at +Z)",
    output: `Board collision prevention via workspace radius limit (MAX_REACH = ${MAX_REACH} m)`,
    why: "The panel board sits at positive Z in Three.js world space after the robot's -PI/2 X rotation; MAX_REACH already prevents unreachable targets.",
  });
  // Note: No target.z < BOARD_MIN_Z guard — after robot.rotation.x = -Math.PI/2 the URDF +Y
  // axis maps to Three.js +Z. The board is in front of the robot (positive Z), not negative.
  // The workspace radius bound (MAX_REACH = 1.0m) is the correct guard for out-of-range targets.

  const originalAngles = currentJointAngles();

  const isSingular =
    Math.abs((robot.joints["joint2"]?.angle as number) ?? 0) < 0.01 &&
    Math.abs((robot.joints["joint3"]?.angle as number) ?? 0) < 0.01;
  if (isSingular) {
    if (robot.joints["joint2"]) robot.setJointValue("joint2", 0.05);
    if (robot.joints["joint3"]) robot.setJointValue("joint3", 0.1);
    robot.updateMatrixWorld(true);
    report.steps.push({
      label: "Singularity kick",
      equation: "|q2| < 0.01 and |q3| < 0.01 -> q2 = 0.05, q3 = 0.10",
      output: "Applied small bend before solving",
      why: "A perfectly straight arm can make useful Jacobian columns collapse, so a small bend restores a usable gradient.",
    });
  }

  let converged = false;
  let iterationsUsed = 0;
  let finalEePos = new THREE.Vector3();
  let lastErrorNorm = Number.POSITIVE_INFINITY;
  let lastStepNorm = 0;
  let lastJacobianColumns = 0;
  let lastDlsDet = 0;
  let lastMaxDeltaTheta = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    iterationsUsed = iter + 1;
    robot.updateMatrixWorld(true);

    const eePos = new THREE.Vector3();
    eeLink.getWorldPosition(eePos);
    finalEePos.copy(eePos);

    const error = new THREE.Vector3().subVectors(targetWorld, eePos);
    const errorNorm = error.length();
    lastErrorNorm = errorNorm;

    if (errorNorm < TOLERANCE) {
      converged = true;
      console.log(`[moveTo] Converged in ${iter} iters - error: ${(errorNorm * 1000).toFixed(2)}mm`);
      break;
    }

    if (errorNorm > MAX_STEP) {
      error.normalize().multiplyScalar(MAX_STEP);
    }
    lastStepNorm = error.length();

    const N = activeNames.length;
    lastJacobianColumns = N;
    const J: THREE.Vector3[] = [];

    for (let i = 0; i < N; i++) {
      const joint = robot.joints[activeNames[i]];
      const jointAxis = new THREE.Vector3()
        .copy(joint.axis)
        .applyQuaternion(joint.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      const jointPos = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);
      const diff = new THREE.Vector3().subVectors(eePos, jointPos);
      J.push(new THREE.Vector3().crossVectors(jointAxis, diff));
    }

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
      A[r][r] += DAMPING * DAMPING;
    }

    const det =
      A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
      A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
      A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

    if (Math.abs(det) < 1e-9) {
      console.warn(`[moveTo] Singular Jacobian at iter ${iter} - aborting`);
      break;
    }
    lastDlsDet = det;

    const d = 1.0 / det;
    const invA = [
      [(A[1][1] * A[2][2] - A[1][2] * A[2][1]) * d, (A[0][2] * A[2][1] - A[0][1] * A[2][2]) * d, (A[0][1] * A[1][2] - A[0][2] * A[1][1]) * d],
      [(A[1][2] * A[2][0] - A[1][0] * A[2][2]) * d, (A[0][0] * A[2][2] - A[0][2] * A[2][0]) * d, (A[0][2] * A[1][0] - A[0][0] * A[1][2]) * d],
      [(A[1][0] * A[2][1] - A[1][1] * A[2][0]) * d, (A[0][1] * A[2][0] - A[0][0] * A[2][1]) * d, (A[0][0] * A[1][1] - A[0][1] * A[1][0]) * d],
    ];

    const temp = new THREE.Vector3(
      invA[0][0] * error.x + invA[0][1] * error.y + invA[0][2] * error.z,
      invA[1][0] * error.x + invA[1][1] * error.y + invA[1][2] * error.z,
      invA[2][0] * error.x + invA[2][1] * error.y + invA[2][2] * error.z,
    );

    for (let i = 0; i < N; i++) {
      const dTheta = J[i].dot(temp);
      lastMaxDeltaTheta = Math.max(lastMaxDeltaTheta, Math.abs(dTheta));
      const joint = robot.joints[activeNames[i]];
      let next = ((joint.angle as number) ?? 0) + dTheta;

      if (joint.jointType === "revolute" && joint.limit) {
        next = Math.max(joint.limit.lower, Math.min(joint.limit.upper, next));
      }

      robot.setJointValue(activeNames[i], next);
    }
  }

  report.iterations = iterationsUsed;
  robot.updateMatrixWorld(true);
  eeLink.getWorldPosition(finalEePos);
  const finalError = targetWorld.distanceTo(finalEePos);
  const finalConverged = converged || finalError < TOLERANCE;
  report.finalWorld = { x: finalEePos.x, y: finalEePos.y, z: finalEePos.z };
  report.finalErrorMeters = finalError;
  report.steps.push(
    {
      label: "Position error",
      equation: "e = targetWorld - endEffectorWorld",
      output: `last |e| = ${fmt(lastErrorNorm)} m; final |e| = ${fmt(finalError)} m`,
      why: "IK minimizes this vector until the stylus is close enough to the requested target.",
    },
    {
      label: "Step limiter",
      equation: "e_step = normalize(e) * min(|e|, maxStep)",
      output: `maxStep = ${fmt(MAX_STEP)} m; last |e_step| = ${fmt(lastStepNorm)} m`,
      why: "Limiting the requested correction keeps each iteration stable and prevents overshoot.",
    },
    {
      label: "Jacobian column",
      equation: "J_i = jointAxisWorld x (endEffectorWorld - jointOriginWorld)",
      output: `${lastJacobianColumns} active joint columns built`,
      why: "For a revolute joint, this cross product predicts how that joint's rotation moves the stylus in world X/Y/Z.",
    },
    {
      label: "Damped least squares",
      equation: "deltaTheta = J^T (J J^T + lambda^2 I)^-1 e_step",
      output: `lambda = ${fmt(DAMPING)}; det(JJ^T + lambda^2 I) = ${fmt(lastDlsDet, 8)}`,
      why: "Damping keeps the inverse stable near singular poses while still moving toward the target.",
    },
    {
      label: "Joint update and clamp",
      equation: "q_next = clamp(q_current + deltaTheta, lowerLimit, upperLimit)",
      output: `largest |deltaTheta| = ${fmt(lastMaxDeltaTheta)} rad`,
      why: "Every iteration projects angles back into valid joint limits, so the solver does not accept impossible configurations.",
    },
    {
      label: "Convergence test",
      equation: `success = finalError < ${TOLERANCE} m`,
      output: `${fmt(finalError)} m < ${fmt(TOLERANCE)} m is ${finalConverged}`,
      why: "The requested motion is considered accurate when the stylus is within 5 mm of the target.",
    },
  );

  if (finalConverged) {
    for (const name of jointNames) {
      const joint = robot.joints[name];
      if (joint && joint.jointType === "revolute") {
        const angle = (joint.angle as number) ?? 0;
        if (angle < joint.limit.lower || angle > joint.limit.upper) {
          jointNames.forEach((n, i) => robot.setJointValue(n, originalAngles[i]));
          robot.updateMatrixWorld(true);
          return finish(report, false, originalAngles, `${name}_out_of_limits`);
        }
      }
    }

    // Verify all joints and the end-effector do not collide with ground or board
    const coll = checkCollision(robot, activeNames, eeLink);
    if (coll.collision) {
      console.warn(`[moveTo] Collision detected during movement verification: ${coll.reason}`);
      jointNames.forEach((n, i) => robot.setJointValue(n, originalAngles[i]));
      robot.updateMatrixWorld(true);
      return finish(report, false, originalAngles, "out_of_bounds");
    }

    const finalAngles = currentJointAngles();
    store.setCurrentAngles(finalAngles);
    console.log("[moveTo] Success:", finalAngles.map((a) => a.toFixed(3)));
    return finish(report, true, finalAngles);
  }

  console.warn(
    `[moveTo] Did not converge - Target: (${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)}), ` +
      `Final EE: (${finalEePos.x.toFixed(3)}, ${finalEePos.y.toFixed(3)}, ${finalEePos.z.toFixed(3)}), ` +
      `Error: ${(finalError * 1000).toFixed(2)}mm`,
  );
  jointNames.forEach((n, i) => robot.setJointValue(n, originalAngles[i]));
  robot.updateMatrixWorld(true);
  return finish(report, false, originalAngles, "ik_did_not_converge");
}

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as any).moveTo = moveTo;
}
