"use client";

/**
 * DebugControls — manual nudge buttons for testing forward kinematics.
 *
 * Every nudge is routed through moveTo() so all 3 safety checks are enforced:
 * 1. Joint limit clamping (inside each IK iteration)
 * 2. Workspace bounds check (before IK)
 * 3. Convergence check (after IK, before joint update)
 */
import { useRobotStore } from "@/state/robotStore";
import { checkCollision } from "@/lib/moveTo";

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

    const stylusLinkName = useRobotStore.getState().stylusLinkName || "stylus_tip";
    const eeLink = robot.links[stylusLinkName];
    if (!eeLink) return;

    const currentVal = (joint.angle as number) ?? 0;
    let targetVal = currentVal + delta;

    // 1. Clamp to joint limits
    if (joint.jointType === "revolute" && joint.limit) {
      targetVal = Math.max(joint.limit.lower, Math.min(joint.limit.upper, targetVal));
    }

    if (Math.abs(targetVal - currentVal) < 1e-4) {
      console.warn(`[DebugControls] Nudge blocked: ${jointName} is at its limit`);
      return;
    }

    // 2. Temporarily set joint value for collision check
    robot.setJointValue(jointName, targetVal);
    robot.updateMatrixWorld(true);

    // 3. Collision check
    const activeNames = jointNames.filter((n) => {
      const j = robot.joints[n];
      return j && (j.jointType === "revolute" || j.jointType === "continuous");
    });
    const coll = checkCollision(robot, activeNames, eeLink);

    if (coll.collision) {
      // Revert change
      robot.setJointValue(jointName, currentVal);
      robot.updateMatrixWorld(true);
      console.warn(`[DebugControls] Nudge blocked: collision detected (${coll.reason})`);
    } else {
      // Accept change and sync store state
      const angles = jointNames.map((n) => (robot.joints[n]?.angle as number) ?? 0);
      useRobotStore.getState().setCurrentAngles(angles);
      console.log(`[DebugControls] Nudged ${jointName} to ${targetVal.toFixed(3)} rad`);
    }
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
