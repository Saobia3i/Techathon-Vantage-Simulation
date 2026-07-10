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
import { moveToSmooth as moveTo } from "@/lib/animateArm";
import * as THREE from "three";

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

    // Get current EE world position
    robot.updateMatrixWorld(true);
    const eePosNow = new THREE.Vector3();
    eeLink.getWorldPosition(eePosNow);

    // Compute Jacobian column for this joint
    const axis = new THREE.Vector3()
      .copy(joint.axis)
      .applyQuaternion(joint.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const jointPos = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);
    const diff = new THREE.Vector3().subVectors(eePosNow, jointPos);
    const jacobianCol = new THREE.Vector3().crossVectors(axis, diff);

    // Predicted new EE target from joint angle delta
    const newTarget = eePosNow.clone().addScaledVector(jacobianCol, delta);

    const result = moveTo({ x: newTarget.x, y: newTarget.y, z: newTarget.z });
    if (result.success) {
      console.log(`[DebugControls] ${jointName} nudge accepted`);
    } else {
      console.warn(`[DebugControls] ${jointName} nudge blocked: ${result.reason}`);
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
