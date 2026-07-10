const THREE = require('three');

// Define link lengths from URDF
const j1_z = 0.05;
const j2_z = 0.14;
const j3_z = 0.22;
const j4_z = 0.18;
const j5_z = 0.15;
const j6_z = 0.12;
const stylus_z = 0.07 + 0.02; // stylus_joint offset + stylus_tip visual origin offset

// Initial joint angles (ready pose)
let q1 = 0;
let q2 = 0.4;
let q3 = -0.8;
let q4 = 0;
let q5 = -0.4;
let q6 = 0;

// World key position of Key 1 (URDF: x=0.10, y=0.04, z=0.28)
// Rotated -90 degrees on X:
const target = new THREE.Vector3(0.10, 0.28, -0.04);

// Simple forward kinematics function
function forwardKinematics(q1, q2, q3, q4, q5, q6) {
  // Create joints hierarchy
  const base = new THREE.Object3D();
  base.rotation.x = -Math.PI / 2; // robot root rotation

  const joint1 = new THREE.Object3D();
  joint1.position.set(0, 0, j1_z);
  base.add(joint1);

  const joint2 = new THREE.Object3D();
  joint2.position.set(0, 0, j2_z);
  joint1.add(joint2);

  const joint3 = new THREE.Object3D();
  joint3.position.set(0, 0, j3_z);
  joint2.add(joint3);

  const joint4 = new THREE.Object3D();
  joint4.position.set(0, 0, j4_z);
  joint3.add(joint4);

  const joint5 = new THREE.Object3D();
  joint5.position.set(0, 0, j5_z);
  joint4.add(joint5);

  const joint6 = new THREE.Object3D();
  joint6.position.set(0, 0, j6_z);
  joint5.add(joint6);

  const ee = new THREE.Object3D();
  ee.position.set(0, 0, stylus_z);
  joint6.add(ee);

  // Set joint angles
  joint1.rotation.set(0, 0, q1); // J1: Z-axis
  joint2.rotation.set(0, q2, 0); // J2: Y-axis
  joint3.rotation.set(0, q3, 0); // J3: Y-axis
  joint4.rotation.set(0, 0, q4); // J4: Z-axis
  joint5.rotation.set(0, q5, 0); // J5: Y-axis
  joint6.rotation.set(0, 0, q6); // J6: Z-axis

  base.updateMatrixWorld(true);

  const eePos = new THREE.Vector3();
  ee.getWorldPosition(eePos);

  const jointPositions = [joint1, joint2, joint3, joint4, joint5, joint6].map(j => {
    const p = new THREE.Vector3();
    j.getWorldPosition(p);
    return p;
  });

  const jointAxes = [
    new THREE.Vector3(0, 0, 1).applyQuaternion(joint1.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    new THREE.Vector3(0, 1, 0).applyQuaternion(joint2.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    new THREE.Vector3(0, 1, 0).applyQuaternion(joint3.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    new THREE.Vector3(0, 0, 1).applyQuaternion(joint4.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    new THREE.Vector3(0, 1, 0).applyQuaternion(joint5.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    new THREE.Vector3(0, 0, 1).applyQuaternion(joint6.getWorldQuaternion(new THREE.Quaternion())).normalize()
  ];

  return { eePos, jointPositions, jointAxes };
}

// Run DLS loop
const maxIterations = 250;
const tolerance = 0.005;
const damping = 0.03;
const maxStep = 0.04;

console.log("Starting IK DLS simulation to target:", target);

for (let iter = 0; iter < maxIterations; iter++) {
  const { eePos, jointPositions, jointAxes } = forwardKinematics(q1, q2, q3, q4, q5, q6);
  const error = new THREE.Vector3().subVectors(target, eePos);
  const errorNorm = error.length();

  if (errorNorm < tolerance) {
    console.log(`CONVERGED in ${iter} iterations! Final error: ${(errorNorm*1000).toFixed(2)}mm`);
    console.log(`Angles: q1=${q1.toFixed(3)}, q2=${q2.toFixed(3)}, q3=${q3.toFixed(3)}, q4=${q4.toFixed(3)}, q5=${q5.toFixed(3)}, q6=${q6.toFixed(3)}`);
    return;
  }

  if (errorNorm > maxStep) {
    error.normalize().multiplyScalar(maxStep);
  }

  // Build Jacobian (3x6)
  const J = [];
  for (let i = 0; i < 6; i++) {
    const axis = jointAxes[i];
    const pos = jointPositions[i];
    const diff = new THREE.Vector3().subVectors(eePos, pos);
    J.push(new THREE.Vector3().crossVectors(axis, diff));
  }

  // Compute A = J*J^T + lambda^2*I (3x3)
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  for (let r = 0; r < 3; r++) {
    for (const col of J) {
      const valR = r === 0 ? col.x : r === 1 ? col.y : col.z;
      A[r][0] += valR * col.x;
      A[r][1] += valR * col.y;
      A[r][2] += valR * col.z;
    }
    A[r][r] += damping * damping;
  }

  // Invert A
  const det =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

  if (Math.abs(det) < 1e-9) {
    console.log("SINGULAR MATRIX - det is zero!");
    break;
  }

  const d = 1.0 / det;
  const invA = [
    [(A[1][1]*A[2][2]-A[1][2]*A[2][1])*d, (A[0][2]*A[2][1]-A[0][1]*A[2][2])*d, (A[0][1]*A[1][2]-A[0][2]*A[1][1])*d],
    [(A[1][2]*A[2][0]-A[1][0]*A[2][2])*d, (A[0][0]*A[2][2]-A[0][2]*A[2][0])*d, (A[0][2]*A[1][0]-A[0][0]*A[1][2])*d],
    [(A[1][0]*A[2][1]-A[1][1]*A[2][0])*d, (A[0][1]*A[2][0]-A[0][0]*A[2][1])*d, (A[0][0]*A[1][1]-A[0][1]*A[1][0])*d]
  ];

  const temp = new THREE.Vector3(
    invA[0][0]*error.x + invA[0][1]*error.y + invA[0][2]*error.z,
    invA[1][0]*error.x + invA[1][1]*error.y + invA[1][2]*error.z,
    invA[2][0]*error.x + invA[2][1]*error.y + invA[2][2]*error.z
  );

  // Apply updates
  const dThetas = [];
  for (let i = 0; i < 6; i++) {
    const dTheta = J[i].dot(temp);
    dThetas.push(dTheta);
  }

  q1 += dThetas[0];
  q2 += dThetas[1];
  q3 += dThetas[2];
  q4 += dThetas[3];
  q5 += dThetas[4];
  q6 += dThetas[5];

  // Clamp limits to ±180 degrees (Math.PI)
  q2 = Math.max(-Math.PI, Math.min(Math.PI, q2));
  q3 = Math.max(-Math.PI, Math.min(Math.PI, q3));
  q5 = Math.max(-Math.PI, Math.min(Math.PI, q5));
}

console.log("FAILED to converge after max iterations!");
const { eePos } = forwardKinematics(q1, q2, q3, q4, q5, q6);
const dist = eePos.distanceTo(target);
console.log(`Angles: q1=${q1.toFixed(3)}, q2=${q2.toFixed(3)}, q3=${q3.toFixed(3)}, q4=${q4.toFixed(3)}, q5=${q5.toFixed(3)}, q6=${q6.toFixed(3)}`);
console.log(`Final EE position: (${eePos.x.toFixed(3)}, ${eePos.y.toFixed(3)}, ${eePos.z.toFixed(3)}), Error: ${(dist*1000).toFixed(2)}mm`);
