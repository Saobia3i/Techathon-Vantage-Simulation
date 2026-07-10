import { NextRequest, NextResponse } from "next/server";

type VoiceAction =
  | { type: "move_delta"; dx?: number; dy?: number; dz?: number }
  | { type: "move_absolute"; x: number; y: number; z: number }
  | { type: "move_to_key"; digit: string }
  | { type: "rotate_base"; degrees: number }
  | { type: "clarify"; question: string }
  | { type: "reject"; reason: string };

type AgenticVoiceResponse = {
  confirmation: string;
  actions: VoiceAction[];
  source?: "groq" | "fallback";
};

const MAX_ACTIONS = 5;
const MAX_DELTA_METERS = 0.2;
const DEFAULT_STEP = 0.06;

function clampDelta(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_DELTA_METERS, Math.min(MAX_DELTA_METERS, value));
}

function deltaFromDirection(direction: string, distance = DEFAULT_STEP): VoiceAction | null {
  const d = clampDelta(distance);
  const dir = direction.toLowerCase();
  if (dir.includes("up")) return { type: "move_delta", dy: d };
  if (dir.includes("down")) return { type: "move_delta", dy: -d };
  if (dir.includes("left")) return { type: "move_delta", dx: -d };
  if (dir.includes("right")) return { type: "move_delta", dx: d };
  if (dir.includes("forward")) return { type: "move_delta", dz: -d };
  if (dir.includes("back") || dir.includes("backward")) return { type: "move_delta", dz: d };
  return null;
}

function fallbackFromInstruction(instruction: string): AgenticVoiceResponse {
  const text = instruction.toLowerCase();
  const actions: VoiceAction[] = [];

  const keyMatches = [...text.matchAll(/(?:key|button)\s*([1-6])/g)];
  for (const match of keyMatches.slice(0, MAX_ACTIONS)) {
    actions.push({ type: "move_to_key", digit: match[1] });
  }

  const rotateMatch = text.match(/rotate\s+(?:base\s+)?(-?\d+(?:\.\d+)?)\s*(?:degree|degrees)?/);
  if (rotateMatch) {
    const degrees = Number(rotateMatch[1]);
    if (Number.isFinite(degrees) && Math.abs(degrees) <= 90) {
      actions.push({ type: "rotate_base", degrees });
    }
  }

  for (const direction of ["up", "down", "left", "right", "forward", "backward", "back"]) {
    if (text.includes(direction)) {
      const action = deltaFromDirection(direction);
      if (action) actions.push(action);
    }
  }

  if (actions.length === 0) {
    return {
      confirmation: "I need a clearer movement command.",
      actions: [{ type: "clarify", question: "Should I move up, down, left, right, forward, backward, or to a numbered key?" }],
      source: "fallback",
    };
  }

  return {
    confirmation: "Interpreted with the safe local fallback.",
    actions: actions.slice(0, MAX_ACTIONS),
    source: "fallback",
  };
}

function sanitizeAction(action: unknown): VoiceAction | null {
  if (!action || typeof action !== "object") return null;
  const raw = action as Record<string, unknown>;

  if (raw.type === "move_delta" || raw.type === "move" || raw.type === "relative_move") {
    const direction = String(raw.direction ?? raw.dir ?? "").trim();
    if (direction) {
      const distance = Number(raw.distance ?? raw.amount ?? raw.meters ?? DEFAULT_STEP);
      return deltaFromDirection(direction, Number.isFinite(distance) ? distance : DEFAULT_STEP);
    }

    const dx = Number(raw.dx ?? raw.x ?? 0);
    const dy = Number(raw.dy ?? raw.y ?? 0);
    const dz = Number(raw.dz ?? raw.z ?? 0);
    if (![dx, dy, dz].every(Number.isFinite)) return null;
    if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) > MAX_DELTA_METERS) return null;
    return { type: "move_delta", dx, dy, dz };
  }

  if (raw.type === "move_absolute") {
    const x = Number(raw.x);
    const y = Number(raw.y);
    const z = Number(raw.z);
    if (![x, y, z].every(Number.isFinite)) return null;
    return { type: "move_absolute", x, y, z };
  }

  if (raw.type === "move_to_key" || raw.type === "press_key" || raw.type === "touch_key") {
    const digit = String(raw.digit ?? raw.key ?? raw.button ?? "");
    if (!/^[1-6]$/.test(digit)) return null;
    return { type: "move_to_key", digit };
  }

  if (raw.type === "rotate_base") {
    const degrees = Number(raw.degrees);
    if (!Number.isFinite(degrees) || Math.abs(degrees) > 90) return null;
    return { type: "rotate_base", degrees };
  }

  if (raw.type === "clarify") {
    const question = String(raw.question ?? "").trim();
    if (!question) return null;
    return { type: "clarify", question };
  }

  if (raw.type === "reject") {
    const reason = String(raw.reason ?? "").trim();
    if (!reason) return null;
    return { type: "reject", reason };
  }

  return null;
}

function extractRawActions(obj: Record<string, unknown>) {
  if (Array.isArray(obj.actions)) return obj.actions;
  if (Array.isArray(obj.commands)) return obj.commands;
  if (Array.isArray(obj.steps)) return obj.steps;
  if (obj.action) return [obj.action];
  if (obj.command) return [obj.command];
  return [];
}

function sanitizeResponse(raw: unknown, instruction: string): AgenticVoiceResponse {
  if (!raw || typeof raw !== "object") {
    return fallbackFromInstruction(instruction);
  }

  const obj = raw as Record<string, unknown>;
  const confirmation = String(obj.confirmation ?? "Parsed instruction.").slice(0, 240);
  const rawActions = extractRawActions(obj);
  const actions = rawActions
    .slice(0, MAX_ACTIONS)
    .map(sanitizeAction)
    .filter((action): action is VoiceAction => action !== null);

  if (actions.length === 0) {
    return fallbackFromInstruction(instruction);
  }

  return { confirmation, actions, source: "groq" };
}

function parseJsonContent(content: unknown) {
  if (typeof content !== "string") return null;
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const instruction = String(body.instruction ?? "").trim();
  if (!instruction) {
    return NextResponse.json({
      confirmation: "Please provide a voice or typed instruction.",
      actions: [{ type: "clarify", question: "What should the robot do?" }],
      source: "fallback",
    });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(fallbackFromInstruction(instruction), { status: 200 });
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You convert robot arm voice instructions into strict JSON only. " +
            "Coordinate frame is Three.js world: +Y up, -Z forward, +Z backward, -X left, +X right. " +
            "Use small deltas unless exact coordinates or keys are requested. " +
            "Allowed actions: move_delta, move_absolute, move_to_key, rotate_base, clarify, reject. " +
            "Examples: move up -> {\"confirmation\":\"Moving up a little.\",\"actions\":[{\"type\":\"move_delta\",\"dy\":0.06}]}; " +
            "move to key 4 -> {\"confirmation\":\"Moving to key 4.\",\"actions\":[{\"type\":\"move_to_key\",\"digit\":\"4\"}]}. " +
            "If ambiguous, return clarify. If unsafe or impossible, return reject. " +
            "Never include prose outside JSON. Return shape: {\"confirmation\":\"...\",\"actions\":[...]}",
        },
        {
          role: "user",
          content:
            `Instruction: ${instruction}\n` +
            `Current position: ${JSON.stringify(body.currentPosition ?? null)}\n` +
            `Available keys: ${JSON.stringify(body.availableKeys ?? [])}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    return NextResponse.json(fallbackFromInstruction(instruction));
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = parseJsonContent(content);

  return NextResponse.json(sanitizeResponse(parsed, instruction));
}
