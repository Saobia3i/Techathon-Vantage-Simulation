"use client";

/**
 * RobotScene — Three.js + urdf-loader 3D viewport.
 *
 * Lifecycle:
 *   1. Mounts renderer into containerRef
 *   2. Loads /public/robot/arm.urdf
 *   3. Pushes robot, jointNames, linkNames to robotStore
 *   4. Calls renderKeyPanel() to place keys in scene
 *   5. animate() loop reads joint angles → setCurrentAngles (read-only observation)
 *   6. Cleans up on unmount
 *
 * IMPORTANT: this component NEVER calls robot.joints[x].setJointValue().
 * Joint values are set exclusively through moveTo() — CONTEXT.md §2.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader from "urdf-loader";
import type { URDFRobot } from "urdf-loader";
import { useRobotStore } from "@/state/robotStore";
import { renderKeyPanel } from "@/components/renderKeyPanel";

export function RobotScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.15);

    // ── Camera ────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.01,
      100
    );
    camera.position.set(1.2, 0.9, 1.2);

    // ── Orbit controls ────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.35, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.3;
    controls.maxDistance = 4;
    controls.update();

    // ── Lighting ──────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(2, 3, 2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xe2e8f0, 0.2);
    rimLight.position.set(-2, 1, -2);
    scene.add(rimLight);

    // ── Ground plane ──────────────────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.9,
        metalness: 0.1,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper for spatial reference
    const grid = new THREE.GridHelper(4, 20, 0x94a3b8, 0xe2e8f0);
    grid.position.y = 0.001;
    scene.add(grid);

    // ── Load URDF ─────────────────────────────────────────────────────────
    const loader = new URDFLoader();
    // loader.packages is needed if meshes reference package:// URIs.
    // For the placeholder URDF (cylinders only) this is a no-op.
    // When you swap in the real URDF, set this to the mesh subfolder:
    //   loader.packages = { "vantage_arm": "/robot" };
    loader.packages = { "": "/robot" };

    loader.load(
      "/robot/arm.urdf",
      (robot: URDFRobot) => {
        // URDF is Z-up; Three.js is Y-up — rotate to stand upright
        robot.rotation.x = -Math.PI / 2;
        robot.castShadow = true;
        scene.add(robot);

        // ── Publish to shared store (read by IK, dashboard, PIN entry) ──
        const store = useRobotStore.getState();
        store.setRobot(robot);

        // Expose to window for easy console testing (Checklist Step 6)
        (window as any).robot = robot;

        const jointNames = Object.keys(robot.joints);
        const linkNames = Object.keys(robot.links);
        store.setJointNames(jointNames);
        store.setLinkNames(linkNames);

        // ── Console inspection — find stylusLinkName here ───────────────
        console.group("[RobotScene] URDF loaded ✓");
        console.log("Joint names:", jointNames);
        console.log("Link names:", linkNames);
        console.log(
          "TODO: identify stylusLinkName from the list above and hardcode in robotStore.ts"
        );
        console.groupEnd();

        // ── Render key panel (parented to robot root) ───────────────────
        renderKeyPanel(scene, robot);
      },
      (progress?: ProgressEvent) => {
        if (progress && progress.total > 0) {
          console.log(
            `[RobotScene] Loading URDF: ${Math.round((progress.loaded / progress.total) * 100)}%`
          );
        }
      },
      (err: any) => {
        console.error("[RobotScene] URDF load failed:", err);
      }
    );

    // ── Animation loop ────────────────────────────────────────────────────
    let animFrameId: number;
    function animate() {
      animFrameId = requestAnimationFrame(animate);
      controls.update();

      // Read current joint angles from the live robot — observation only.
      // Joint values are never SET here; that goes through moveTo().
      const robot = useRobotStore.getState().robot;
      if (robot) {
        const angles = Object.values(robot.joints).map(
          (j) => (j.angle as number) ?? 0
        );
        useRobotStore.getState().setCurrentAngles(angles);
      }

      renderer.render(scene, camera);
    }
    animate();

    // ── Resize observer ───────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
