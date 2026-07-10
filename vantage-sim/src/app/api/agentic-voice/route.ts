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
};

const MAX_ACTIONS = 5;
const MAX_DELTA_METERS = 0.2;

function sanitizeAction(action: unknown): VoiceAction | null {
  if (!action || typeof action !== "object") return null;
  const raw = action as Record<string, unknown>;

  if (raw.type === "move_delta") {
    const dx = Number(raw.dx ?? 0);
    const dy = Number(raw.dy ?? 0);
    const dz = Number(raw.dz ?? 0);
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

  if (raw.type === "move_to_key") {
    const digit = String(raw.digit ?? "");
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

function sanitizeResponse(raw: unknown): AgenticVoiceResponse {
  if (!raw || typeof raw !== "object") {
    return {
      confirmation: "I could not parse the instruction safely.",
      actions: [{ type: "reject", reason: "Malformed model response" }],
    };
  }

  const obj = raw as Record<string, unknown>;
  const confirmation = String(obj.confirmation ?? "Parsed instruction.").slice(0, 240);
  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];
  const actions = rawActions
    .slice(0, MAX_ACTIONS)
    .map(sanitizeAction)
    .filter((action): action is VoiceAction => action !== null);

  if (actions.length === 0) {
    return {
      confirmation: "I could not find a safe motion command.",
      actions: [{ type: "reject", reason: "No valid safe action returned" }],
    };
  }

  return { confirmation, actions };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        confirmation: "Groq API key is not configured.",
        actions: [{ type: "reject", reason: "Missing GROQ_API_KEY" }],
      },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const instruction = String(body.instruction ?? "").trim();
  if (!instruction) {
    return NextResponse.json({
      confirmation: "Please provide a voice or typed instruction.",
      actions: [{ type: "clarify", question: "What should the robot do?" }],
    });
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
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      {
        confirmation: "Groq could not interpret the command.",
        actions: [{ type: "reject", reason: text.slice(0, 180) || `Groq HTTP ${res.status}` }],
      },
      { status: 502 },
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  return NextResponse.json(sanitizeResponse(parsed));
}
