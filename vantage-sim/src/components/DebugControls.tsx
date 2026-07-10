"use client";

/**
 * DebugControls — manual nudge buttons for testing forward kinematics.
 *
 * Directly calls setJointValue on the URDFRobot object in the store
 * and triggers updateMatrixWorld(true) to test propagation.
 */
import { useRobotStore } from "@/state/robotStore";

export function DebugControls() {
  const { robot, jointNames } = useRobotStore();

  function nudgeJoint(index: number, delta: number) {
    if (!robot) {
      console.warn("[DebugControls] Robot not loaded yet");
      return;
    }
    const jointName = jointNames[index];
    const joint = robot.joints[jointName];
    if (!joint) return;
    
    const current = (joint.angle as number) ?? 0;
    joint.setJointValue(current + delta);
    robot.updateMatrixWorld(true);
    
    console.log(`[DebugControls] ${jointName} -> ${(current + delta).toFixed(3)} rad`);
  }

  if (jointNames.length === 0) return null;

  return (
    <section className="rounded-xl bg-slate-50 border border-slate-200/80 p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
        DEBUG — direct joint nudge
      </h3>
      <div className="space-y-1.5">
        {jointNames.map((name, i) => (
          <div key={name} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
            <span className="font-mono text-slate-500 font-semibold">{name}</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => nudgeJoint(i, -0.2)}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded-lg active:scale-90 transition-all font-bold cursor-pointer text-slate-700 w-8 text-center"
              >
                -
              </button>
              <button
                onClick={() => nudgeJoint(i, 0.2)}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded-lg active:scale-90 transition-all font-bold cursor-pointer text-slate-700 w-8 text-center"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
