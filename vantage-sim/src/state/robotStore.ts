/**
 * Zustand shared store — single source of truth for all phases.
 *
 * Shape is locked per CONTEXT.md §6.2.
 * Do NOT change field names or types without coordinating with every branch
 * listed in CONTEXT.md §4.
 *
 * Populated by:
 *   - feature/visualization-dashboard: robot, jointNames, linkNames, currentAngles, keyPositions
 *   - feature/ik-core-pipeline:        jointLimits, stylusLinkName
 */
import { create } from "zustand";
import type { URDFRobot } from "urdf-loader";
import type { JointLimit } from "@/types/robot";

interface RobotState {
  // ── Robot object (set once URDF loads) ──────────────────────────────────
  robot: URDFRobot | null;

  // ── Names extracted from the loaded URDF ────────────────────────────────
  jointNames: string[];
  linkNames: string[];

  // ── Joint limits (lower/upper in radians) — filled by IK branch ─────────
  jointLimits: JointLimit[];

  // ── Live joint angles in radians, one per joint, in URDF joint order ────
  currentAngles: number[];

  /**
   * Exact link name of the stylus tip in the loaded URDF.
   * Log Object.keys(robot.links) on load and hardcode once confirmed.
   * e.g. "stylus_tip" | "tool0" | "link6" — depends on Vantage's URDF naming.
   *
   * TODO (Phase 1): confirm from console log and set the real value here.
   */
  stylusLinkName: string;

  // ── Key panel positions from key.config.json (base-frame coords) ────────
  keyPositions: Record<string, { x: number; y: number; z: number }>;

  // ── Setters ──────────────────────────────────────────────────────────────
  setRobot: (r: URDFRobot) => void;
  setJointNames: (names: string[]) => void;
  setLinkNames: (names: string[]) => void;
  setJointLimits: (limits: JointLimit[]) => void;
  setCurrentAngles: (angles: number[]) => void;
  setStylusLinkName: (name: string) => void;
  setKeyPositions: (positions: Record<string, { x: number; y: number; z: number }>) => void;
}

export const useRobotStore = create<RobotState>((set) => ({
  robot: null,
  jointNames: [],
  linkNames: [],
  jointLimits: [],
  currentAngles: [],
  stylusLinkName: "stylus_tip",
  keyPositions: {},

  setRobot: (r) => set({ robot: r }),
  setJointNames: (names) => set({ jointNames: names }),
  setLinkNames: (names) => set({ linkNames: names }),
  setJointLimits: (limits) => set({ jointLimits: limits }),
  setCurrentAngles: (angles) => set({ currentAngles: angles }),
  setStylusLinkName: (name) => set({ stylusLinkName: name }),
  setKeyPositions: (positions) => set({ keyPositions: positions }),
}));

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as any).useRobotStore = useRobotStore;
}
