"use client";

import { useRobotStore } from "@/state/robotStore";
import { useEffect, useState, useRef } from "react";
import * as THREE from "three";
import { getStylusTipWorldPosition } from "@/lib/stylusTip";

export function JointPreviewOverlay() {
  const { robot, jointNames, currentAngles, lastIKReport } = useRobotStore();
  const [eePos, setEePos] = useState({ x: 0, y: 0, z: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastUpdate = useRef(0);

  // Render loop for coordinates and Canvas Kinematic Schematic
  useEffect(() => {
    if (!robot) return;
    const name = useRobotStore.getState().stylusLinkName || "stylus_tip";
    const eeLink = robot.links[name];
    if (!eeLink) return;

    let rafId: number;
    const update = () => {
      robot.updateMatrixWorld(true);
      const v = getStylusTipWorldPosition(robot, name);
      if (!v) return;
      setEePos({ x: v.x, y: v.y, z: v.z });

      // Draw the schematic on the canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          drawSchematic(ctx, canvas, robot, name);
        }
      }

      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [robot, currentAngles]);

  // Projects 3D kinematic joints to a beautiful 2D Canvas profile view
  const drawSchematic = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    robot: any,
    stylusName: string
  ) => {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Draw background subtle grids
    ctx.strokeStyle = "rgba(169, 166, 156, 0.15)";
    ctx.lineWidth = 1;
    for (let x = 20; x < width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 15; y < height; y += 15) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Floor line
    const floorY = height - 15;
    ctx.strokeStyle = "rgba(122, 119, 110, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(5, floorY);
    ctx.lineTo(width - 5, floorY);
    ctx.stroke();
    ctx.fillStyle = "rgba(122, 119, 110, 0.2)";
    ctx.font = "italic 7px sans-serif";
    ctx.fillText("GROUND (Y=0.0)", 8, floorY - 4);

    // Collect 3D positions of the joints in world space
    const jointsChain = ["joint1", "joint2", "joint3", "joint4", "joint5", "joint6"];
    const points: { x: number; y: number; z: number; name: string; axis: string; angle: number }[] = [];

    // Add base origin
    points.push({ x: 0, y: 0, z: 0, name: "base", axis: "none", angle: 0 });

    jointsChain.forEach((name) => {
      const joint = robot.joints[name];
      if (joint) {
        const wp = new THREE.Vector3();
        joint.getWorldPosition(wp);
        const axisStr = joint.axis ? `[${joint.axis.x},${joint.axis.y},${joint.axis.z}]` : "";
        points.push({
          x: wp.x,
          y: wp.y,
          z: wp.z,
          name,
          axis: axisStr,
          angle: (joint.angle as number) ?? 0,
        });
      }
    });

    // Add stylus tip position
    const tipPos = getStylusTipWorldPosition(robot, stylusName);
    if (tipPos) {
      points.push({
        x: tipPos.x,
        y: tipPos.y,
        z: tipPos.z,
        name: "tip",
        axis: "",
        angle: 0,
      });
    }

    // Projection mapping from 3D to 2D canvas:
    // We map side-profile: horizontal = Z extension (robot is rotated), vertical = Y height.
    // Center the base at x = 35px, y = floorY
    const scaleZ = 110; // px/m (scaled down from 165 for compact view)
    const scaleY = 110; // px/m (scaled up from 165 for compact view)
    const originX = 35;

    const projected = points.map((p) => {
      // Calculate radial extension or direct Z
      const radExt = p.z; // since robot faces +Z
      return {
        cx: originX + radExt * scaleZ,
        cy: floorY - p.y * scaleY,
        name: p.name,
        axis: p.axis,
        angle: p.angle,
      };
    });

    // Draw link lines connecting joints
    ctx.strokeStyle = "rgba(184, 118, 63, 0.85)"; // Copper links
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    projected.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.cx, p.cy);
      else ctx.lineTo(p.cx, p.cy);
    });
    ctx.stroke();

    // Draw joint nodes and details
    projected.forEach((p, idx) => {
      const isBase = p.name === "base";
      const isTip = p.name === "tip";

      // Node dot
      ctx.fillStyle = isTip
        ? "rgb(239, 68, 68)" // red stylus tip
        : isBase
        ? "rgb(36, 26, 18)"  // dark walnut base
        : "rgb(74, 52, 35)";  // walnut joint nodes
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, isTip ? 3 : 4, 0, 2 * Math.PI);
      ctx.fill();

      // Outer rings for revolute joints
      if (!isBase && !isTip) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, 2.5, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Draw annotation tags for key joints (J2, J3, J5, tip) to keep HUD clean in small viewport
      const showLabel = p.name === "joint2" || p.name === "joint3" || p.name === "joint5" || p.name === "tip" || p.name === "joint1";
      if (showLabel) {
        ctx.fillStyle = "rgb(42, 29, 20)";
        ctx.font = "bold 7.2px monospace";
        let labelText = "";
        
        if (p.name === "tip") {
          labelText = `Tip`;
        } else {
          const jIdx = p.name.replace("joint", "J");
          const deg = (p.angle * 180) / Math.PI;
          labelText = `${jIdx}:${deg > 0 ? "+" : ""}${deg.toFixed(0)}°`;
        }

        // Offset label coordinates dynamically to prevent overlap
        let ox = 6;
        let oy = 2;
        if (p.name === "joint3") { ox = -38; oy = -4; }
        if (p.name === "joint1") { ox = 6; oy = -1; }
        if (p.name === "tip") { ox = 6; oy = -1; }

        ctx.fillStyle = "rgba(246, 244, 240, 0.9)";
        ctx.fillRect(p.cx + ox - 2, p.cy + oy - 7, ctx.measureText(labelText).width + 4, 9);
        ctx.strokeStyle = "rgba(169, 166, 156, 0.3)";
        ctx.strokeRect(p.cx + ox - 2, p.cy + oy - 7, ctx.measureText(labelText).width + 4, 9);

        ctx.fillStyle = "rgb(42, 29, 20)";
        ctx.fillText(labelText, p.cx + ox, p.cy + oy);
      }
    });
  };

  if (!robot || jointNames.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-20 w-[210px] bg-[--panel]/85 backdrop-blur-md border border-[--steel-400]/40 rounded-lg p-2.5 shadow-lg font-mono text-[9px] text-[--walnut-900] select-none">
      <div className="border-b border-[--steel-400]/30 pb-1 mb-1.5 flex items-center justify-between">
        <span className="font-bold tracking-wider text-[--walnut-700] uppercase font-sans text-[8px]">
          TELEMETRY COMPASS
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      {/* Dynamic 2D Kinematic Profile Preview */}
      <div className="mb-2">
        <div className="bg-white border border-[--steel-200]/50 rounded overflow-hidden">
          <canvas
            ref={canvasRef}
            width={184}
            height={105}
            className="block w-full h-[105px]"
          />
        </div>
      </div>

      {/* Cartesian Position */}
      <div className="space-y-0.5 mb-2">
        <div className="grid grid-cols-3 gap-1 bg-[--steel-100]/60 p-1 rounded border border-[--steel-200]/40 text-center">
          <div>
            <span className="text-[8px] text-[--steel-600] block">X</span>
            <span className="font-bold font-mono">{eePos.x.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-[8px] text-[--steel-600] block">Y</span>
            <span className="font-bold font-mono">{eePos.y.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-[8px] text-[--steel-600] block">Z</span>
            <span className="font-bold font-mono">{eePos.z.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* Safety Layer Indicator */}
      <div className="border-t border-[--steel-400]/20 pt-1.5 flex items-center justify-between">
        <span className="text-[8px] font-sans text-[--steel-600] uppercase font-bold">Safety:</span>
        <span className="px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 text-[8px] font-sans font-bold">
          {lastIKReport?.success === false ? "BLOCKED" : "SAFE"}
        </span>
      </div>
    </div>
  );
}
