# CONTEXT.md
## Vantage Robotics — Web-Based Digital Twin & Control Suite
### Master reference for any AI assistant (Claude, Cursor) working in this repo

> Read this file first, before touching any code. It explains the problem, the
> non-negotiable architecture, who owns what, and the exact interfaces every piece
> of code must respect. If a task seems to require bypassing something described
> here, stop and flag it rather than working around it — the constraints below are
> what the hackathon judges are explicitly scoring.

---

## 1. The Problem (plain summary)

Vantage Robotics makes a 6-axis industrial robotic arm. Right now, every change to
its control software gets tested directly on physical hardware — slow, risky, and
expensive. Leadership wants all control software proven entirely in a browser-based
simulation before it's trusted with a real arm.

We are given:
- A URDF file describing the arm (6 degrees of freedom, fixed stylus tip, no gripper)
- `key.config.json` — fixed 3D coordinates of a 6-key test panel, relative to the
  arm's base frame

We must build:
1. A 3D visualization + live dashboard of the arm
2. An inverse kinematics solver
3. Manual control (on-screen joystick + keyboard)
4. Voice control (deterministic keyword-based, required)
5. Autonomous PIN entry — given a 6-digit PIN, the arm sequences through the
   correct keys and touches each one, entirely on its own
6. An electrical schematic (Wokwi) showing how this would run on real hardware
7. (Optional, bonus) Agentic voice control — free-form natural language routed
   through an LLM reasoning layer, converted into the same structured motion
   commands, gated by the same safety checks as everything else

No physical hardware is used anywhere in the required deliverables. Phase 5 (the
schematic) is a diagram, not a build.

---

## 2. The One Architectural Rule Everything Depends On

**Every control surface calls the same function: `moveTo(x, y, z)`.**

Dashboard (read-only), joystick, keyboard, voice, agentic voice, and the autonomous
PIN sequencer are all *thin input adapters*. None of them are permitted to set joint
angles directly. `moveTo()` internally runs inverse kinematics, validates the result
against joint limits and workspace bounds, and only then updates the rendered robot.

This is not a style preference — it is a scored rubric criterion (Architecture &
Safety, 15%), and it is what makes the optional agentic extension safe: an LLM can
propose a command, but it physically cannot cause motion that hasn't been
independently validated, because there is no code path that skips validation.

```
INPUT LAYER                     CORE PIPELINE                       OUTPUT
───────────                     ──────────────                     ──────
Dashboard (read-only)   ─┐
GUI Joystick             ├──►  moveTo(x, y, z)
Keyboard                 │            │
Voice (keyword, req.)    │            ▼
Voice (agentic, bonus)   │     IK Solver (Damped Least Squares)
Autonomous PIN sequence ─┘            │
                                       ▼
                                Safety Validator
                        (joint limits · workspace bounds · reachability)
                                       │
                                       ▼
                     Joint angles → urdf-loader → Three.js render
```

If you are writing code that sets a joint angle without going through `moveTo()`,
stop — that code is architecturally wrong regardless of whether it "works."

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript strict mode |
| 3D rendering / FK | Three.js + `urdf-loader` |
| State | Zustand (single shared store — see Section 6) |
| Styling | Tailwind CSS + shadcn/ui |
| IK | Hand-rolled Damped Least Squares Jacobian solver (not a library) |
| Voice (required) | Web Speech API (`SpeechRecognition`) |
| Voice (bonus) | Groq tool-calling, JSON action schema |
| Electrical schematic | Wokwi (ESP32 + PCA9685 + 6 servos) — diagram only, no code |

---

## 4. Team & Branch Ownership

| Owner | Branch | Scope |
|---|---|---|
| Tinni | `feature/visualization-dashboard` | URDF loading, live joint/end-effector dashboard, key panel rendering — **build first, everything else's IK testing depends on a loaded robot** |
| Tinni | `feature/ik-core-pipeline` | `moveTo()`, DLS Jacobian IK solver, safety validator, Phase 4 autonomous PIN entry, integration lead across all branches, optional Phase 3B agentic bonus |
| Teammate A | `feature/controls-and-voice` | On-screen joystick, keyboard control, deterministic voice control (Phase 3) — builds against the `moveTo()` stub, does not need Tinni's real IK to start |
| Teammate B | `feature/electrical-schematic` | Wokwi diagram (Phase 5) — no code dependency, can start immediately |

**Merge order matters:** `feature/visualization-dashboard` should merge into `main`
before `feature/ik-core-pipeline`'s real solver is wired in, since the IK solver
needs a loaded `URDFRobot` to test forward kinematics against. `feature/controls-and-voice`
and `feature/electrical-schematic` can be developed and merged at any time —
they don't block or get blocked by the other two.

---

## 5. Build Order (matched to rubric weight, highest-value work first)

1. Phase 1 — Visualization + dashboard (foundation; unblocks IK testing)
2. Phase 2 — IK solver (unblocks manual control, voice, and PIN entry)
3. Phase 4 — Autonomous PIN entry (**highest single rubric weight, 20%** — prioritize correctness here over polish elsewhere)
4. Phase 2 (cont.) — Manual controls (joystick + keyboard)
5. Phase 3 — Deterministic voice control
6. Phase 5 — Electrical schematic (independent, any time)
7. Phase 3B — Agentic voice (optional bonus, only once 1–6 are solid)

---

## 6. Shared Contracts (do not change without updating every consumer)

### 6.1 `moveTo()` signature — the interface everything calls

```typescript
interface Vector3Like { x: number; y: number; z: number; }

interface IKResult {
  success: boolean;
  jointAngles: number[];   // radians, one per joint, in URDF joint order
  reason?: string;          // on failure: "unreachable" | "out_of_bounds" | "joint_N_out_of_limits" | "ik_did_not_converge"
}

function moveTo(target: Vector3Like): IKResult;
```

A stub version (always returns `{ success: true, jointAngles: [0,0,0,0,0,0] }`) is
pushed to `main` first so `feature/controls-and-voice` can build against it
immediately. The real implementation (Damped Least Squares IK + safety validation)
replaces the stub's internals later without changing this signature.

### 6.2 Zustand store shape — `state/robotStore.ts`

```typescript
interface JointLimit { lower: number; upper: number; }

interface RobotState {
  robot: URDFRobot | null;
  jointNames: string[];
  linkNames: string[];
  jointLimits: JointLimit[];
  currentAngles: number[];
  stylusLinkName: string;                                    // e.g. "stylus_tip" — confirm exact name from the URDF
  keyPositions: Record<string, { x: number; y: number; z: number }>;

  setRobot: (r: URDFRobot) => void;
  setJointNames: (names: string[]) => void;
  setLinkNames: (names: string[]) => void;
  setCurrentAngles: (angles: number[]) => void;
  setKeyPositions: (positions: Record<string, { x: number; y: number; z: number }>) => void;
}
```

Every phase reads from this one store. `feature/visualization-dashboard` populates
`robot`, `jointNames`, `linkNames`, `currentAngles`, `keyPositions`.
`feature/ik-core-pipeline` reads all of it and adds `jointLimits` +
`stylusLinkName` once confirmed from the loaded URDF.

### 6.3 `key.config.json` shape (provided by organizers)

```json
{
  "1": { "x": 0.12, "y": 0.04, "z": 0.30 },
  "2": { "x": 0.14, "y": 0.04, "z": 0.30 },
  "...": "..."
}
```
Coordinates are relative to the arm's base frame, not world-absolute — anything
rendering or targeting these must be parented to the robot's root transform, not
the scene root.

### 6.4 Tolerance & units

- Reachability/touch tolerance: **±5mm** (0.005 in whatever unit the URDF uses — confirm units on load, most URDFs are meters)
- This is a kinematic reach-and-touch check, **not** a physics simulation — no collision detection required

---

## 7. Safety Validation (applies to every input path, no exceptions)

Three checks, run inside `moveTo()`, before any joint angle is committed:

1. **Workspace bounds** — is the target geometrically within the arm's reachable envelope? Checked before IK is attempted.
2. **IK convergence** — did the Damped Least Squares solver actually converge within its iteration budget and tolerance?
3. **Joint limits** — clamped during every IK iteration, and re-checked as a final gate before the result is accepted.

If any check fails, `moveTo()` returns `{ success: false, reason: "..." }` and the
robot's rendered state does not change. This applies identically whether the caller
is a human pressing a keyboard key or an LLM in the Phase 3B agentic extension —
there is no separate "trusted" input path.

---

## 8. Evaluation Rubric (for prioritization reference)

| Criterion | Weight |
|---|---|
| Visualization & Dashboard | 15% |
| Inverse Kinematics | 15% |
| Manual Control (joystick + keyboard) | 10% |
| Voice Control | 15% |
| Autonomous PIN Entry | 20% |
| Electrical Schematic | 5% |
| System Architecture & Concept Explanation | 15% |
| Overall Polish & Presentation | 5% |
| Agentic Bonus (Phase 3B) | +10% (bonus, does not subtract if skipped) |

---

## 9. Deliverables

- Working web app demonstrating Phases 1–5
- Source code repository, including this file, the electrical schematic, and setup instructions
- A short demo video: visualization → manual control (joystick + keyboard) → voice control → full autonomous PIN entry run
- Deployed URL (bonus)

---

## 10. What NOT to do

- Do not let any input adapter set joint angles without going through `moveTo()`.
- Do not skip the safety validator for the agentic extension "because the model is usually right" — an ungated agent is explicitly penalized regardless of how capable it appears.
- Do not build physics/collision simulation — it's explicitly out of scope; this is a kinematic reach check only.
- Do not change the `moveTo()` signature or the Zustand store shape without updating every branch that consumes it — check Section 4 for who that affects before renaming or restructuring either.