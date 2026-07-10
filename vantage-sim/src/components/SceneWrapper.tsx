"use client";

/**
 * SceneWrapper — Client Component boundary for the Three.js scene.
 *
 * `ssr: false` with next/dynamic is only allowed inside Client Components.
 * This thin wrapper exists solely to satisfy that Next.js 15 constraint.
 */
import dynamic from "next/dynamic";

function SceneLoading() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-[#0d0d14]">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 animate-spin" />
      </div>
      <p className="text-sm text-white/30 font-mono tracking-wide animate-pulse">
        Loading URDF…
      </p>
    </div>
  );
}

const RobotScene = dynamic(
  () => import("@/components/RobotScene").then((m) => ({ default: m.RobotScene })),
  { ssr: false, loading: () => <SceneLoading /> }
);

export function SceneWrapper() {
  return <RobotScene />;
}
