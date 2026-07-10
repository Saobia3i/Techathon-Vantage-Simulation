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

        // ── RUN AUTOMATIC DIAGNOSTICS FOR CHECKS 1-6 ────────────────────
        console.group("🔍 DIGITAL TWIN DIAGNOSTICS (Checks 1-6)");
        
        // Check 1: Mesh check
        console.log("Check 1: Mesh loading status");
        console.log("  - Loaded URDF Name:", robot.name);
        const hasMeshes = (robot as any).collada || Object.values(robot.links).some((l: any) => 
          l.visual && l.visual.some((v: any) => v.geometry && v.geometry.type === 'Mesh')
        );
        console.log("  - Does URDF contain external meshes?", hasMeshes ? "Yes" : "No (Using primitive shapes/cylinders)");

        // Check 2: Store Identity Check
        const storeRobot = store.robot;
        console.log("Check 2: Store Robot Identity");
        console.log("  - Store Robot exists:", !!storeRobot);
        console.log("  - Store Robot === Loaded Robot:", storeRobot === robot);
        console.log("  - Number of joints in store robot:", storeRobot ? Object.keys(storeRobot.joints).length : 0);

        // Check 3: Joint Types and Axes
        console.log("Check 3: Joint Types and Axes:");
        if (storeRobot) {
          Object.entries(storeRobot.joints).forEach(([name, j]: [string, any]) => {
            console.log(`  - ${name}: type="${j.jointType || j.type}", axis=(${j.axis ? j.axis.x + ',' + j.axis.y + ',' + j.axis.z : 'none'})`);
          });
        }

        // Check 4: Transform Propagation test
        console.log("Check 4: Transform Propagation Test (joint2 nudge)");
        if (storeRobot && storeRobot.joints['joint2']) {
          const j2 = storeRobot.joints['joint2'] as any;
          const initialAngle = j2.angle;
          console.log("  - J2 Angle Before Nudge:", initialAngle);
          
          // Apply nudge
          j2.setJointValue(0.8);
          storeRobot.updateMatrixWorld(true);
          
          const postAngle = j2.angle;
          console.log("  - J2 Angle After Nudge (0.8 rad):", postAngle);
          console.log("  - Did J2 angle update inside the object?", postAngle === 0.8 ? "Yes (Success)" : "No (Failed)");
          
          // Reset it back to initial for visual start state
          j2.setJointValue(initialAngle || 0);
          storeRobot.updateMatrixWorld(true);
        } else {
          console.log("  - Failed: joint2 not found on robot.");
        }

        // Check 6: Dashboard Key Alignment
        console.log("Check 6: Dashboard Joint keys order alignment");
        const keysOrder = Object.keys(robot.joints);
        console.log("  - Keys iteration order:", JSON.stringify(keysOrder));
        console.groupEnd();

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
      const jointNames = useRobotStore.getState().jointNames;
      if (robot && jointNames.length > 0) {
        // Ensure coordinate matrices are updated before reading positions/angles
        robot.updateMatrixWorld(true);
        const angles = jointNames.map(
          (name) => (robot.joints[name]?.angle as number) ?? 0
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
