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
    <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ background: "var(--steel-100)" }}>
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: "var(--steel-200)" }} />
        <div className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--copper)", borderTopColor: "transparent" }} />
      </div>
      <p className="text-xs font-sans animate-pulse" style={{ color: "var(--steel-400)", letterSpacing: "0.05em" }}>
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
