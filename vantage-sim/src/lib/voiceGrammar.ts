export type SpeechAlternative = {
  transcript: string;
  confidence?: number;
};

const COMMAND_WORDS = ["move", "key", "button", "press", "touch", "rotate", "base"];
const DIRECTION_WORDS = ["up", "down", "left", "right", "forward", "backward", "back"];

function collapse(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeVoiceText(input: string) {
  let text = input
    .toLowerCase()
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\b(moved|moving|mover)\b/g, "move");

  const replacements: Array<[RegExp, string]> = [
    [/\b(write|rite|wright)\b/g, "right"],
    [/\b(move|go|shift)\s+lift\b/g, "$1 left"],
    [/\bfor\s+word\b/g, "forward"],
    [/\bfore\s+word\b/g, "forward"],
    [/\bfour\s+word\b/g, "forward"],
    [/\bforwards\b/g, "forward"],
    [/\bback\s+word\b/g, "backward"],
    [/\bbackwards\b/g, "backward"],
    [/\b(?:key|button)\s+(one|won)\b/g, "key 1"],
    [/\b(?:key|button)\s+(two|too|to)\b/g, "key 2"],
    [/\b(?:key|button)\s+(three|tree|free)\b/g, "key 3"],
    [/\b(?:key|button)\s+(four|for)\b/g, "key 4"],
    [/\b(?:key|button)\s+(five|fife)\b/g, "key 5"],
    [/\b(?:key|button)\s+(six|sicks|sex)\b/g, "key 6"],
    [/\b(?:key|button)\s+(seven)\b/g, "key 7"],
    [/\b(?:key|button)\s+(eight|ate)\b/g, "key 8"],
    [/\b(?:key|button)\s+(nine)\b/g, "key 9"],
    [/\b(?:key|button)\s+(zero|oh)\b/g, "key 0"],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return collapse(text);
}

export function getSpeechAlternatives(event: any): SpeechAlternative[] {
  const result = event?.results?.[0];
  if (!result) return [];

  const alternatives: SpeechAlternative[] = [];
  for (let i = 0; i < result.length; i++) {
    const transcript = String(result[i]?.transcript ?? "").trim();
    if (transcript) {
      alternatives.push({ transcript, confidence: result[i]?.confidence });
    }
  }

  return alternatives;
}

export function hasRecognizedVoiceIntent(text: string) {
  const normalized = normalizeVoiceText(text);
  if (/(?:move\s+to\s+|press\s+|touch\s+)?key\s*[0-9]\b/.test(normalized)) return true;
  if (/rotate\s+(?:base\s+)?-?\d+(?:\.\d+)?/.test(normalized)) return true;
  return DIRECTION_WORDS.some((direction) => normalized.includes(`move ${direction}`));
}

function scoreTranscript(text: string, confidence = 0) {
  const normalized = normalizeVoiceText(text);
  let score = confidence || 0;

  for (const word of COMMAND_WORDS) {
    if (normalized.includes(word)) score += 1;
  }
  for (const word of DIRECTION_WORDS) {
    if (normalized.includes(word)) score += 2;
  }
  if (hasRecognizedVoiceIntent(normalized)) score += 10;

  return score;
}

export function chooseBestVoiceTranscript(alternatives: SpeechAlternative[] | string[]) {
  const normalizedAlternatives = alternatives
    .map((item) =>
      typeof item === "string"
        ? { transcript: item, confidence: 0 }
        : { transcript: item.transcript, confidence: item.confidence ?? 0 },
    )
    .filter((item) => item.transcript.trim().length > 0);

  if (normalizedAlternatives.length === 0) return "";

  const best = normalizedAlternatives
    .slice()
    .sort((a, b) => scoreTranscript(b.transcript, b.confidence) - scoreTranscript(a.transcript, a.confidence))[0];

  return normalizeVoiceText(best.transcript);
}

export function describeVoiceCorrection(raw: string, normalized: string) {
  const rawClean = collapse(raw.toLowerCase());
  if (!rawClean || rawClean === normalized) return normalized;
  return `${rawClean} -> ${normalized}`;
}
