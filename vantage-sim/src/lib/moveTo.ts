/**
 * moveTo() — stub implementation.
 *
 * This stub is pushed to main FIRST so feature/controls-and-voice can build
 * against the real signature immediately. The real DLS Jacobian IK solver
 * (feature/ik-core-pipeline) replaces the internals without changing this signature.
 *
 * CONTEXT.md §6.1 — do NOT change the function signature.
 */
import type { Vector3Like, IKResult } from "@/types/robot";

export function moveTo(_target: Vector3Like): IKResult {
  // STUB — always succeeds with zero angles.
  // Replace internals only in feature/ik-core-pipeline.
  return {
    success: true,
    jointAngles: [0, 0, 0, 0, 0, 0],
  };
}
