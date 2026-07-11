# Vantage Digital Twin Update

This file compares the current implementation with `CONTEXT.md` and summarizes what has been done, how it was done, how to verify it, and what is still a known limitation.

## Context Alignment

### Core Rule
`CONTEXT.md` says every control surface must route motion through `moveTo(x, y, z)`.

Current status: done.

How it is enforced:
- Dashboard key buttons call `moveToSmooth()`, which internally validates through `moveTo()`.
- Keyboard calls `moveToSmooth()` for each WASD/QE movement.
- Joystick calls `moveToSmooth()` for drag, height, and step nudges.
- Deterministic voice calls `moveToSmooth()`.
- Agentic voice converts language into structured actions, preflight-validates the whole plan through `moveTo()`, then executes approved steps with `moveToSmooth()`.
- Autonomous PIN entry validates input first, then calls `moveToSmooth()` for approach, touch, and retract.

No main input path is allowed to set joint angles directly as its motion API.

## Done

### Phase 1 - Visualization and Dashboard
- URDF arm is loaded with Three.js and `urdf-loader`.
- The robot is rendered with steel/brass-style materials and a warm studio scene.
- Zustand stores the loaded robot, joints, links, current joint angles, joint limits, stylus link, key targets, and latest IK report.
- Dashboard and telemetry show robot state and equation-wise IK diagnostics.

### Phase 2 - IK Core Pipeline
- Implemented Damped Least Squares inverse kinematics in `moveTo.ts`.
- Main equations shown in telemetry:
  - `e = targetWorld - endEffectorWorld`
  - `J_i = jointAxisWorld x (endEffectorWorld - jointOriginWorld)`
  - `deltaTheta = J^T (J J^T + lambda^2 I)^-1 e_step`
  - `q_next = clamp(q_current + deltaTheta, lowerLimit, upperLimit)`
- Safety gates inside `moveTo()`:
  - robot loaded
  - active joints exist
  - max reach
  - min reach
  - ground/keypad surface guard
  - IK convergence within 5 mm
  - joint limit validation
  - sampled ground/keypad collision check
- `moveToSmooth()` wraps `moveTo()` so callers get the same validation plus visible smooth animation.

### Keypad and `key.config.json`
- Six-key panel is rendered as a real keypad/backplate, not loose floating cubes.
- Targets are placed at the key face center.
- Key targets are converted to world coordinates before being stored in Zustand.
- `key.config.json` now supports both likely organizer formats:
  - object map: `{ "1": { "x": ..., "y": ..., "z": ... } }`
  - labeled array: `{ "keys": [{ "digit": "8", "x": ..., "y": ..., "z": ... }] }`
- If a config has unlabeled array positions, the app assigns fallback labels `1-6` by order and this should be explained during demo.

### Phase 3 - Manual Controls
- Keyboard supports WASD + QE movement in the correct world frame.
- Joystick was rebuilt as `JoystickControl.tsx` using native pointer events.
- Joystick mapping:
  - right = `+X`
  - left = `-X`
  - forward = `-Z`
  - backward = `+Z`
  - height slider = world `Y`
- Joystick reads the live end-effector tip before each move and uses `moveToSmooth()`.

### Phase 3 - Deterministic Voice
- Uses browser `SpeechRecognition`.
- Supports:
  - `move up`
  - `move down`
  - `move left`
  - `move right`
  - `move forward`
  - `move backward`
  - `move to key N`
  - `rotate base 30 degrees`
- Recognition is hardened:
  - checks up to 5 speech alternatives
  - normalizes common errors like `move write` -> `move right`
  - supports key word homophones such as `key eight`, `key two`, `key oh`

### Phase 3B - Agentic Voice Bonus
- Implemented `/api/agentic-voice`.
- Uses Groq tool-calling with a `plan_robot_motion` function schema.
- The model returns:
  - `confirmation`
  - strict structured action list
- Supported action types:
  - `move_delta`
  - `move_absolute`
  - `move_to_key`
  - `rotate_base`
  - `clarify`
  - `reject`
- Safety hardening:
  - ambiguous instructions return `clarify`
  - malformed output falls back to safe local parsing
  - impossible/unsafe output is rejected or discarded
  - max 5 actions per plan
  - relative deltas are capped at 0.20 m
  - absolute coordinates are bounded before client execution
  - the browser compiles the whole returned plan into targets
  - the browser preflight-validates every target through raw `moveTo()`
  - robot pose is restored after preflight
  - only a fully valid plan is executed visibly through `moveToSmooth()`

This directly addresses the context warning against an ungated agent.

### Phase 4 - Autonomous PIN Entry
- PIN is not hardcoded.
- User enters a runtime PIN in the UI.
- Valid PIN rule:
  - exactly 6 digits
  - each digit must exist on the loaded six-key panel
  - repeated digits are allowed
- Examples:
  - valid for current fallback panel: `123456`, `112233`, `654321`
  - invalid if digit missing from panel: `127456`
  - invalid length: `1234`
  - invalid characters: `abcdef`
- The sequencer shows validated normalized output before execution.
- It performs approach -> touch -> retract for each digit.
- Approach/retract lift in world `Y`, matching the coordinate contract.
- Every motion result is checked; a failed approach/touch/retract aborts the sequence visibly.

### Safety Feedback
- Raw reason codes are translated into readable UI messages.
- Examples:
  - `board_collision` -> `Invalid: keypad collision risk`
  - `ground_collision` -> `Invalid: ground collision risk`
  - `ik_did_not_converge` -> `Invalid: IK could not reach the target within 5 mm`
- The global safety pill and local panels show the result.

## How To Understand The Agent Works

Use the Voice tab, Phase 3B Agentic Voice section.

### Test 1 - Valid Multi-Step Plan
Typed command:

```text
move right a little then move up a little
```

Expected:
- UI says Groq is interpreting.
- It executes step 1, then step 2.
- Final message says actions executed through `moveTo`.
- Source should show `Groq tool-call` if `GROQ_API_KEY` is active, otherwise `safe fallback`.

What this proves:
- Free-form language was converted to structured actions.
- Multiple actions were sequenced.
- Execution still went through the motion pipeline.

### Test 2 - Key Target Plus Relative Move
Typed command:

```text
move to key 4 then move up a little
```

Expected:
- Agent converts to `move_to_key` then `move_delta`.
- Browser preflight-validates both steps.
- If both are safe, the arm moves to key 4 and then lifts up.

What this proves:
- The agent can mix key commands and relative motion.

### Test 3 - Unsafe Later Step
Typed command:

```text
move to key 4, move down, move up a little
```

Expected:
- The app rejects before visible motion.
- Message should say something like:
  `Plan rejected before motion at step 2: Invalid: keypad collision risk`

What this proves:
- The app does not execute the first safe step if a later step is unsafe.
- The agent is gated by the same safety validator, not trusted blindly.

### Test 4 - Ambiguous Command
Typed command:

```text
move there
```

Expected:
- The robot does not move.
- Agent asks for clarification.

What this proves:
- Ambiguous intent is not guessed.

### Test 5 - Invalid/Out-of-Range Motion
Typed command:

```text
move up 5 meters
```

Expected:
- The action is clamped/rejected/preflight-blocked.
- The robot does not execute unsafe motion.

What this proves:
- Large unsafe requests are gated.

## How To Verify The Required App

### Build Verification
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- Next build includes `/api/agentic-voice` as a dynamic API route.

### Manual Demo Checklist
- Dashboard: click loaded key buttons.
- Joystick: drag circular pad, move height slider, use step nudges.
- Keyboard: activate keyboard panel and use WASD + QE.
- Deterministic voice: say `move right`, `move up`, `move to key 4`.
- Agentic voice typed: run `move to key 4 then move up a little`.
- Agentic voice invalid: run `move to key 4, move down, move up a little`.
- PIN: enter `123456` or repeated valid digits like `112233`.
- PIN invalid: enter `127456` or `1234` and confirm graceful rejection.

## Remaining Issues / Assumptions

### Official Key Config
- Current `public/robot/key.config.json` is a sample/fallback layout.
- If the official file contains different digit labels, the app will now use those labels.
- If the official file contains only coordinates, the app assigns `1-6` by order and this assumption should be explained.

### IK Limitations
- This is kinematic IK, not physics simulation.
- The solver targets position only; it does not solve stylus orientation.
- Some poses can still fail if the position is reachable only with a required stylus orientation.
- Singularity kick and ready pose reduce, but do not eliminate, singularity risk.

### Agentic Voice Runtime
- `GROQ_API_KEY` must exist in `.env`.
- Restart the dev server after editing `.env`.
- If Groq is unavailable, safe local fallback still works, but the source will not be `Groq tool-call`.
- Browser speech recognition works best in Chrome/Edge.

### Context Mismatches
- `CONTEXT.md` says Next.js 15, current app uses Next.js 16.2.10.
- `CONTEXT.md` mentions shadcn/ui, current app mostly uses custom Tailwind/CSS.
- `CONTEXT.md` says no collision simulation required; this app includes a lightweight ground/keypad safety sampling check as an extra validator, not a full physics engine.

## Not Touched

- Electrical schematic / Wokwi / teammate-owned Phase 5 files.
- The core `moveTo(target)` public contract.
