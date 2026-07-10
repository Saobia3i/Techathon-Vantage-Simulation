/**
 * Shared type contracts for the Vantage Robotics digital twin.
 * Do NOT change these shapes without updating every branch that consumes them
 * (see CONTEXT.md §6 and §4 for consumer list).
 */

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface JointLimit {
  lower: number; // radians
  upper: number; // radians
}

export interface IKResult {
  success: boolean;
  /** Radians, one per joint, in URDF joint order */
  jointAngles: number[];
  /** On failure: "unreachable" | "out_of_bounds" | "joint_N_out_of_limits" | "ik_did_not_converge" */
  reason?: string;
}
