# Vantage Digital Twin Update

## Done

### Core Architecture
- All main motion paths are still routed through `moveTo(target)`.
- Dashboard key buttons, keyboard, joystick, deterministic voice, agentic voice, and PIN sequencing use the same IK/safety pipeline.
- Electrical schematic/Wokwi work was not touched. That remains teammate-owned.

### IK Core Pipeline
- Implemented/checked Damped Least Squares IK:
  - `e = targetWorld - endEffectorWorld`
  - `J_i = jointAxisWorld x (endEffectorWorld - jointOriginWorld)`
  - `deltaTheta = J^T (J J^T + lambda^2 I)^-1 e_step`
  - `q_next = clamp(q_current + deltaTheta, lowerLimit, upperLimit)`
- Workspace checks are in `moveTo()`:
  - robot loaded
  - active joints exist
  - target max reach
  - target min reach
  - ground limit
  - convergence within 5 mm
  - final joint limit validation
- Telemetry shows equation-wise IK output after motion attempts.

### Keypad / Six Buttons
- Fixed the previous loose floating cube look.
- Restored `key.config.json` to organizer-style base-frame coordinates.
- Rendered the six keys as a real test panel:
  - dark backplate
  - raised colored keys
  - visible digit labels `1-6`
  - target points stored on the key face, not inside the cube
- Key targets are converted from robot/base frame to world frame before being stored.

### Voice Control
- Deterministic voice supports:
  - `move up`
  - `move down`
  - `move left`
  - `move right`
  - `move forward`
  - `move backward`
  - `move to key 1-6`
  - `rotate base 30 degrees`
- Phase 3B agentic voice added:
  - separate `Speak Agentic Command` button
  - typed fallback for testing
  - server route `/api/agentic-voice`
  - Groq output converted into strict structured actions
  - malformed/weak Groq output falls back to safe local parsing
  - final execution still goes through `moveTo()`

### Verification
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- Next build includes `/api/agentic-voice` as a dynamic server route.

## Ki Ki Bad / Remaining Issues

### Must Recheck In Browser
- Restart the dev server and hard refresh the browser. Old runtime state/cache can still show the old floating keys.
- Test these manually:
  - Dashboard `Key 1-6`
  - PIN preset `1-2-3-4-5-6`
  - deterministic voice `move up`
  - agentic typed fallback `move to key 4 then move up`
  - agentic mic command with the same phrase

### Keypad Placement
- `CONTEXT.md` says `key.config.json` coordinates are organizer-provided and base-frame relative.
- Current coordinates are placeholder/sample coordinates. If the official PDF gives exact key positions, replace only `public/robot/key.config.json`.
- Do not move the keys arbitrarily in code unless the official coordinates are wrong or unreachable.

### IK Limitations
- This is kinematic IK only, not physics/collision simulation.
- The DLS solver targets position only. It does not solve stylus orientation.
- If a key is reachable only with a specific stylus angle, this solver may still fail because orientation is not constrained.
- Near singular poses can still be difficult, though a singularity kick and ready pose help.

### Agentic Voice
- Groq requires `GROQ_API_KEY` in `.env`.
- Dev server must be restarted after changing `.env`.
- Browser SpeechRecognition support varies. Chrome/Edge are safest.
- Agentic route has safe fallback, but real Groq behavior still needs live API testing.

### CONTEXT.md Notes
- The architecture guidance is correct: every motion must go through `moveTo()`.
- The electrical schematic ownership separation is correct and was respected.
- Minor mismatch: `CONTEXT.md` says Next.js 15, but the app currently uses Next.js 16.
- Minor mismatch: `CONTEXT.md` mentions shadcn/ui, but current UI is mostly custom Tailwind/CSS.

## Do Not Touch
- Electrical schematic / Wokwi / teammate-owned Phase 5 files.
- Any code path that bypasses `moveTo()` for motion.
