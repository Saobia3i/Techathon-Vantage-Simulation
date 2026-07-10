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
    const targetVal = current + delta;
    
    // Call the official robot.setJointValue API
    robot.setJointValue(jointName, targetVal);
    robot.updateMatrixWorld(true);
    
    console.log(`[DebugControls] ${jointName} -> ${targetVal.toFixed(3)} rad`);
  }

  if (jointNames.length === 0) return null;

  return (
    <section className="rounded-lg bg-[--bg-panel] border border-[--border-subtle] p-4">
      <h3 className="text-[11px] font-semibold font-sans uppercase tracking-widest text-[--text-secondary] border-b border-[--border-subtle] pb-2 mb-3">
        DEBUG — direct joint nudge
      </h3>
      <div className="space-y-1">
        {jointNames.map((name, i) => (
          <div key={name} className="flex items-center justify-between py-1.5 border-b border-[--border-subtle]/30 last:border-0">
            <span className="text-xs font-mono text-[--text-secondary] w-20">{name}</span>
            <div className="flex rounded-full border border-[--border-subtle] overflow-hidden bg-[--bg-base]">
              <button
                onClick={() => nudgeJoint(i, -0.2)}
                className="px-3 py-1 text-sm text-[--text-secondary] hover:bg-[--bronze] hover:text-[--text-primary] active:opacity-80 transition-colors w-8 text-center flex items-center justify-center font-bold cursor-pointer"
              >
                −
              </button>
              <div className="w-px bg-[--border-subtle]" />
              <button
                onClick={() => nudgeJoint(i, 0.2)}
                className="px-3 py-1 text-sm text-[--text-secondary] hover:bg-[--bronze] hover:text-[--text-primary] active:opacity-80 transition-colors w-8 text-center flex items-center justify-center font-bold cursor-pointer"
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
