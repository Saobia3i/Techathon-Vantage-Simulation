const fs = require('fs');
const path = require('path');

// We can mock a minimal Three.js environment if needed, but let's see if we can just read the URDF file as text and parse it.
const urdfPath = path.join(__dirname, 'public', 'robot', 'arm.urdf');
const content = fs.readFileSync(urdfPath, 'utf8');
console.log("URDF Content length:", content.length);

// Let's inspect the joint tag types and limits in the file
const parser = require('xml2js');
parser.parseString(content, (err, result) => {
  if (err) {
    console.error("XML parse error:", err);
    return;
  }
  const joints = result.robot.joint;
  console.log("Joints in XML:");
  joints.forEach(j => {
    console.log(`  - Name: ${j.$.name}, Type: ${j.$.type}, Axis: ${j.axis ? JSON.stringify(j.axis[0].$) : 'none'}`);
  });
});
