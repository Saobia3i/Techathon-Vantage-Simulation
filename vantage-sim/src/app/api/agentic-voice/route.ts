import { NextRequest, NextResponse } from "next/server";
import { normalizeVoiceText } from "@/lib/voiceGrammar";

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
  source?: "groq_tool" | "groq_json" | "fallback";
};

const MAX_ACTIONS = 5;
const MAX_DELTA_METERS = 0.2;
const DEFAULT_STEP = 0.06;
const ABS_LIMIT = 1.0;

const MOTION_TOOL = {
  type: "function",
  function: {
    name: "plan_robot_motion",
    description:
      "Convert a free-form robot arm instruction into safe structured motion actions. Return clarify instead of guessing.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["confirmation", "actions"],
      properties: {
        confirmation: {
          type: "string",
          description: "Short natural-language confirmation of what was understood.",
        },
        actions: {
          type: "array",
          minItems: 1,
          maxItems: MAX_ACTIONS,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: {
              type: {
                type: "string",
                enum: ["move_delta", "move_absolute", "move_to_key", "rotate_base", "clarify", "reject"],
              },
              dx: { type: "number" },
              dy: { type: "number" },
              dz: { type: "number" },
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
              digit: { type: "string", enum: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] },
              degrees: { type: "number", minimum: -90, maximum: 90 },
              question: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
      },
    },
  },
};

function clarify(question: string, confirmation = "I need clarification."): AgenticVoiceResponse {
  return { confirmation, actions: [{ type: "clarify", question }], source: "fallback" };
}

function reject(reason: string, source: AgenticVoiceResponse["source"] = "fallback"): AgenticVoiceResponse {
  return { confirmation: "Command rejected by the agentic gate.", actions: [{ type: "reject", reason }], source };
}

function clampDelta(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_DELTA_METERS, Math.min(MAX_DELTA_METERS, value));
}

function distanceFromText(text: string) {
  const meterMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\b/);
  if (meterMatch) return clampDelta(Number(meterMatch[1]));

  const cmMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:cm|centimeter|centimeters)\b/);
  if (cmMatch) return clampDelta(Number(cmMatch[1]) / 100);

  if (/\b(tiny|slight|slightly|little|bit)\b/.test(text)) return 0.03;
  if (/\b(big|large|far)\b/.test(text)) return 0.1;
  return DEFAULT_STEP;
}

function deltaFromDirection(direction: string, distance = DEFAULT_STEP): VoiceAction | null {
  const d = clampDelta(distance);
  const dir = normalizeVoiceText(direction);
  if (dir.includes("up")) return { type: "move_delta", dy: d };
  if (dir.includes("down")) return { type: "move_delta", dy: -d };
  if (dir.includes("left")) return { type: "move_delta", dx: -d };
  if (dir.includes("right")) return { type: "move_delta", dx: d };
  if (dir.includes("forward")) return { type: "move_delta", dz: -d };
  if (dir.includes("back")) return { type: "move_delta", dz: d };
  return null;
}

function fallbackFromInstruction(instruction: string, availableKeys: string[]): AgenticVoiceResponse {
  const text = normalizeVoiceText(instruction);
  if (/\b(there|that|it|somewhere|nearby|around)\b/.test(text) && !/\b(key|button|up|down|left|right|forward|back|rotate)\b/.test(text)) {
    return clarify("Which key or direction should I move to?");
  }

  const clauses = text
    .split(/\b(?:then|and|after that|next)\b/g)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const actions: VoiceAction[] = [];

  for (const clause of clauses.length > 0 ? clauses : [text]) {
    const keyMatch = clause.match(/(?:key|button|press|touch)\s*([0-9])/);
    if (keyMatch) {
      const digit = keyMatch[1];
      if (!availableKeys.includes(digit)) return reject(`Key ${digit} is not loaded.`);
      actions.push({ type: "move_to_key", digit });
      continue;
    }

    const rotateMatch = clause.match(/rotate\s+(?:base\s+)?(-?\d+(?:\.\d+)?)\s*(?:degree|degrees)?/);
    if (rotateMatch) {
      const degrees = Number(rotateMatch[1]);
      if (!Number.isFinite(degrees) || Math.abs(degrees) > 90) return reject("Rotation must be between -90 and 90 degrees.");
      actions.push({ type: "rotate_base", degrees });
      continue;
    }

    const distance = distanceFromText(clause);
    for (const direction of ["up", "down", "left", "right", "forward", "backward", "back"]) {
      if (clause.includes(direction)) {
        const action = deltaFromDirection(direction, distance);
        if (action) actions.push(action);
        break;
      }
    }
  }

  if (actions.length === 0) {
    return clarify("Should I move up, down, left, right, forward, backward, rotate the base, or move to one of the loaded keys?");
  }

  return {
    confirmation: "Interpreted with the safe local fallback.",
    actions: actions.slice(0, MAX_ACTIONS),
    source: "fallback",
  };
}

function sanitizeAction(action: unknown, availableKeys: string[]): VoiceAction | null {
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
    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > ABS_LIMIT || y < 0) return null;
    return { type: "move_absolute", x, y, z };
  }

  if (raw.type === "move_to_key" || raw.type === "press_key" || raw.type === "touch_key") {
    const digit = String(raw.digit ?? raw.key ?? raw.button ?? "");
    if (!/^[0-9]$/.test(digit) || !availableKeys.includes(digit)) return null;
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

function sanitizeResponse(
  raw: unknown,
  instruction: string,
  availableKeys: string[],
  source: AgenticVoiceResponse["source"],
): AgenticVoiceResponse {
  if (!raw || typeof raw !== "object") {
    return fallbackFromInstruction(instruction, availableKeys);
  }

  const obj = raw as Record<string, unknown>;
  const confirmation = String(obj.confirmation ?? "Parsed instruction.").slice(0, 240);
  const rawActions = extractRawActions(obj);
  const actions = rawActions
    .slice(0, MAX_ACTIONS)
    .map((action) => sanitizeAction(action, availableKeys))
    .filter((action): action is VoiceAction => action !== null);

  if (actions.length === 0) {
    return fallbackFromInstruction(instruction, availableKeys);
  }

  return { confirmation, actions, source };
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

function parseGroqMessage(message: any) {
  const toolCall = message?.tool_calls?.find((call: any) => call?.function?.name === "plan_robot_motion");
  if (toolCall?.function?.arguments) {
    return { parsed: parseJsonContent(toolCall.function.arguments), source: "groq_tool" as const };
  }
  return { parsed: parseJsonContent(message?.content), source: "groq_json" as const };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const instruction = normalizeVoiceText(String(body.instruction ?? "").trim());
  const availableKeys = Array.isArray(body.availableKeys)
    ? body.availableKeys.map(String).filter((key: string) => /^[0-9]$/.test(key))
    : [];

  if (!instruction) {
    return NextResponse.json(clarify("What should the robot do?"));
  }

  const localPlan = fallbackFromInstruction(instruction, availableKeys);
  const isClearLocalCommand = !localPlan.actions.some((action) => action.type === "clarify");

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(localPlan, { status: 200 });
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
      tools: [MOTION_TOOL],
      tool_choice: { type: "function", function: { name: "plan_robot_motion" } },
      messages: [
        {
          role: "system",
          content:
            "You are a cautious robot motion planner. Convert instructions into the plan_robot_motion tool call only. " +
            "Coordinate frame: +Y up, -Z forward, +Z backward, -X left, +X right. " +
            "Use move_delta for relative motion, move_to_key for keys, rotate_base for base rotation. " +
            "Use small deltas by default: 0.03m tiny, 0.06m normal, 0.10m large. Never exceed 0.20m delta. " +
            "If the request is ambiguous, use clarify. If it asks for keys outside the available key list, unsafe ranges, or non-motion tasks, use reject. " +
            "Do not invent coordinates. Exact absolute coordinates are allowed only when the user explicitly gives numeric x/y/z values.",
        },
        {
          role: "user",
          content:
            `Instruction: ${instruction}\n` +
            `Current position: ${JSON.stringify(body.currentPosition ?? null)}\n` +
            `Available keys: ${JSON.stringify(availableKeys)}\n` +
            `Local parser saw this as: ${isClearLocalCommand ? JSON.stringify(localPlan.actions) : "ambiguous"}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    return NextResponse.json(localPlan);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  const { parsed, source } = parseGroqMessage(message);

  return NextResponse.json(sanitizeResponse(parsed, instruction, availableKeys, source));
}
