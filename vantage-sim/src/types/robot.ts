/**
 * Shared type contracts for the Vantage Robotics digital twin.
 * Keep moveTo(target) as the single public motion API.
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

export interface IKEquationStep {
  label: string;
  equation: string;
  output: string;
  why: string;
}

export interface IKEquationReport {
  targetWorld: Vector3Like;
  finalWorld?: Vector3Like;
  finalErrorMeters?: number;
  iterations: number;
  success: boolean;
  reason?: string;
  steps: IKEquationStep[];
}

export interface IKResult {
  success: boolean;
  /** Radians, one per joint, in URDF joint order. */
  jointAngles: number[];
  /** On failure: "unreachable" | "out_of_bounds" | "joint_N_out_of_limits" | "ik_did_not_converge". */
  reason?: string;
  /** Optional diagnostics for the latest IK equations and numeric outputs. */
  report?: IKEquationReport;
}
