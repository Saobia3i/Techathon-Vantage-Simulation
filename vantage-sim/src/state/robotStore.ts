import { create } from "zustand";
import type { URDFRobot } from "urdf-loader";
import type { IKEquationReport, JointLimit } from "@/types/robot";

interface RobotState {
  robot: URDFRobot | null;
  jointNames: string[];
  linkNames: string[];
  jointLimits: JointLimit[];
  currentAngles: number[];
  stylusLinkName: string;
  keyPositions: Record<string, { x: number; y: number; z: number }>;
  lastIKReport: IKEquationReport | null;

  setRobot: (r: URDFRobot | null) => void;
  setJointNames: (names: string[]) => void;
  setLinkNames: (names: string[]) => void;
  setJointLimits: (limits: JointLimit[]) => void;
  setCurrentAngles: (angles: number[]) => void;
  setStylusLinkName: (name: string) => void;
  setKeyPositions: (positions: Record<string, { x: number; y: number; z: number }>) => void;
  setLastIKReport: (report: IKEquationReport | null) => void;
}

export const useRobotStore = create<RobotState>((set) => ({
  robot: null,
  jointNames: [],
  linkNames: [],
  jointLimits: [],
  currentAngles: [],
  stylusLinkName: "stylus_tip",
  keyPositions: {},
  lastIKReport: null,

  setRobot: (r) => set({ robot: r }),
  setJointNames: (names) => set({ jointNames: names }),
  setLinkNames: (names) => set({ linkNames: names }),
  setJointLimits: (limits) => set({ jointLimits: limits }),
  setCurrentAngles: (angles) => set({ currentAngles: angles }),
  setStylusLinkName: (name) => set({ stylusLinkName: name }),
  setKeyPositions: (positions) => set({ keyPositions: positions }),
  setLastIKReport: (report) => set({ lastIKReport: report }),
}));

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as any).useRobotStore = useRobotStore;
}
