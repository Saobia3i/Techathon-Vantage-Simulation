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
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PMREMGenerator } from "three";
import URDFLoader from "urdf-loader";
import type { URDFRobot } from "urdf-loader";
import { useRobotStore } from "@/state/robotStore";
import { renderKeyPanel } from "@/components/renderKeyPanel";
import { STEEL_MATERIAL, BRONZE_MATERIAL } from "@/lib/materials";

function overrideMaterialsAndAddCollars(robot: URDFRobot) {
  const jointCollarRadii: Record<string, number> = {
    "joint1": 0.05,
    "joint2": 0.045,
    "joint3": 0.04,
    "joint4": 0.035,
    "joint5": 0.03,
    "joint6": 0.025,
  };

  robot.traverse((child: any) => {
    if (child.isMesh) {
      if (child.name === "joint_collar") return;

      let isJointVisual = false;
      let parent = child.parent;
      while (parent && parent !== robot) {
        if (parent.isURDFJoint || parent.name.toLowerCase().includes("joint")) {
          isJointVisual = true;
          break;
        }
        parent = parent.parent;
      }

      if (isJointVisual) {
        child.material = BRONZE_MATERIAL;
      } else {
        child.material = STEEL_MATERIAL;
      }

      // Smooth cylinder geometry segment count
      if (child.geometry && child.geometry.type === "CylinderGeometry") {
        const params = child.geometry.parameters;
        child.geometry.dispose();
        child.geometry = new THREE.CylinderGeometry(
          params.radiusTop,
          params.radiusBottom,
          params.height,
          32
        );
      }
      
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Add joint collars at joint pivot points
  const joints = (robot as any).joints;
  if (joints) {
    Object.entries(joints).forEach(([name, joint]: [string, any]) => {
      if (joint.jointType === "revolute" || joint.jointType === "continuous") {
        const radius = jointCollarRadii[name] ?? 0.03;
        
        // Remove existing collars if any (to avoid duplicates on hot reload)
        const existing = joint.children.filter((c: any) => c.name === "joint_collar");
        existing.forEach((c: any) => {
          joint.remove(c);
          if (c.geometry) c.geometry.dispose();
        });

        const collarMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, radius * 0.5, 32),
          BRONZE_MATERIAL
        );
        collarMesh.name = "joint_collar";
        if (joint.axis) {
          const axis = joint.axis;
          if (Math.abs(axis.z) > 0.9) {
            collarMesh.rotation.x = Math.PI / 2;
          } else if (Math.abs(axis.x) > 0.9) {
            collarMesh.rotation.z = Math.PI / 2;
          }
        }
        collarMesh.castShadow = true;
        collarMesh.receiveShadow = true;
        joint.add(collarMesh);
      }
    });
  }
}

export function RobotScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    scene.background = new THREE.Color(0x121212);
    scene.fog = new THREE.FogExp2(0x121212, 0.12);

    // ── Environment Reflection (PBR) ──────────────────────────────────────
    const pmremGenerator = new PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

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

    // ── Lighting (3-Point Setup) ──────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    
    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.1);
    keyLight.position.set(3, 4, 2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    
    const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.4);
    fillLight.position.set(-3, 2, -2);
    
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 2, -4);
    
    scene.add(keyLight, fillLight, rimLight);

    // ── Reflective Ground plane ───────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.25,
        metalness: 0.8,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper for spatial reference (low opacity dark lines)
    const grid = new THREE.GridHelper(4, 20, 0x2a2825, 0x1c1b19);
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
        // Override visual materials and add joint collars for realistic look
        overrideMaterialsAndAddCollars(robot);

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
        const hasMeshes = (robot as any).collada || Object.values(robot.links).some((l: any) => {
          if (!l.visual) return false;
          const visuals = Array.isArray(l.visual) ? l.visual : [l.visual];
          return visuals.some((v: any) => v.geometry && v.geometry.type === 'Mesh');
        });
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
        console.error("[URDF LOAD FAILED]", err);
        setLoadError(err?.message || String(err) || "Unknown parsing or network error");
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

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50/95 backdrop-blur-sm p-6 text-center border-2 border-red-200 rounded-xl z-50">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-red-800 mb-2">URDF Load Failed</h3>
          <p className="text-xs text-red-600 font-mono bg-white border border-red-100 rounded px-3 py-1.5 max-w-lg overflow-x-auto whitespace-pre-wrap">
            {loadError}
          </p>
          <p className="text-[10px] text-slate-500 mt-4 max-w-sm">
            Please make sure that the real URDF and its meshes exist under public/robot/ and the file paths resolve correctly.
          </p>
        </div>
      )}
    </div>
  );
}
