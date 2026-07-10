import { moveTo } from "./moveTo";
import { useRobotStore } from "@/state/robotStore";
import type { Vector3Like, IKResult } from "@/types/robot";

const DEFAULT_DURATION_MS = 550;

/** Smoothstep easing: slower start and end, faster in the middle. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

let currentAnimation: { cancel: () => void } | null = null;

/**
 * Cancels any in-flight arm animation immediately (holds current intermediate pose).
 */
export function cancelArmAnimation() {
  if (currentAnimation) {
    currentAnimation.cancel();
    currentAnimation = null;
  }
}

/**
 * moveToSmooth — validates the target through the full moveTo() safety pipeline
 * (joint limits, workspace bounds, IK convergence), then smoothly animates the
 * arm from its current pose to the solved pose using requestAnimationFrame.
 *
 * Returns an IKResult synchronously (same as moveTo), so callers can still check
 * result.success and result.reason immediately. The joint motion itself is async.
 */
export function moveToSmooth(
  target: Vector3Like,
  durationMs: number = DEFAULT_DURATION_MS,
): IKResult {
  const store = useRobotStore.getState();
  const robot = store.robot;
  const jointNames = store.jointNames;

  if (!robot || jointNames.length === 0) {
    return moveTo(target); // fall through to standard error path
  }

  // 1. Snapshot current joint angles before IK modifies anything
  const startAngles = jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0);

  // 2. Run full safety validation + IK. On success the joints are at targetPose.
  const result = moveTo(target);

  if (!result.success) {
    // Safety rejected — joints were already reverted inside moveTo. Nothing to do.
    return result;
  }

  // 3. Capture the validated target angles that moveTo arrived at.
  const endAngles = result.jointAngles.slice();

  // 4. Reset joints back to the pre-move start so we can replay smoothly.
  for (let i = 0; i < jointNames.length; i++) {
    robot.setJointValue(jointNames[i], startAngles[i]);
  }
  robot.updateMatrixWorld(true);

  // 5. Cancel any previous in-flight animation.
  cancelArmAnimation();

  // 6. Animate from startAngles → endAngles over durationMs.
  let rafId: number;
  let startTime: number | null = null;
  let cancelled = false;
  // robot is guaranteed non-null here (checked above); capture for closure.
  const robotRef = robot;

  function frame(timestamp: number) {
    if (cancelled) return;
    if (startTime === null) startTime = timestamp;

    const elapsed = timestamp - startTime;
    const t = Math.min(elapsed / durationMs, 1);
    const easedT = smoothstep(t);

    // Lerp every joint angle
    for (let i = 0; i < jointNames.length; i++) {
      const angle = startAngles[i] + (endAngles[i] - startAngles[i]) * easedT;
      robotRef.setJointValue(jointNames[i], angle);
    }
    robotRef.updateMatrixWorld(true);

    // Sync store so Dashboard and Telemetry panels update live
    const liveAngles = jointNames.map((n) => (robotRef.joints[n]?.angle as number) ?? 0);
    useRobotStore.getState().setCurrentAngles(liveAngles);

    if (t < 1) {
      rafId = requestAnimationFrame(frame);
    } else {
      currentAnimation = null;
    }
  }

  rafId = requestAnimationFrame(frame);
  currentAnimation = {
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    },
  };

  // Return the IK result immediately — callers can show success/failure UI right away
  return result;
}
