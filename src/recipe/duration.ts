/**
 * ISO 8601 durations, which is how schema.org expresses cooking times.
 *
 * Ptitchef writes "PT25M" for 25 minutes and "PT1H30M" for an hour and a half.
 */

const NUMBER_AND_REST = /^(\d+(?:[.,]\d+)?)\s*(.*)$/;

const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** Minutes, or null when the value is absent or unreadable. */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = ISO_DURATION.exec(value.trim().toUpperCase());
  if (!match) {
    return null;
  }

  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 1440 +
    Number(hours ?? 0) * 60 +
    Number(minutes ?? 0) +
    Number(seconds ?? 0) / 60;

  // "P" alone parses but means nothing useful.
  if (total === 0 && !minutes && !hours && !days && !seconds) {
    return null;
  }
  return Math.round(total);
}

/** Minutes as "1 h 30" or "25 min", for the human-readable mirror. */
export function formatMinutes(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  if (rest === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${String(rest).padStart(2, "0")}`;
}

export interface ParsedYield {
  /** Number of servings, or null when the text carries no number. */
  count: number | null;
  /** What is being counted: "personnes", "pièces", "parts". */
  unit: string | null;
  /** The original text, always preserved. */
  text: string;
}

/**
 * The yield as written, out of the three shapes schema.org allows for it: a
 * number, a string, or an array holding either.
 */
function yieldText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }
  return "";
}

/**
 * Read a schema.org recipeYield.
 *
 * Ptitchef writes "6 personnes" but also "15 pièces", so the unit is kept: a
 * recipe yielding pieces cannot be described as serving people.
 */
export function parseYield(value: unknown): ParsedYield {
  const text = yieldText(value);
  if (!text) {
    return { count: null, unit: null, text: "" };
  }

  const match = NUMBER_AND_REST.exec(text);
  if (!match) {
    return { count: null, unit: null, text };
  }

  // Both groups are written into the pattern, so a match always carries them;
  // the fallbacks below are what narrow the types.
  /* v8 ignore start */
  const digits = match[1] ?? "";
  const unit = (match[2] ?? "").trim() || null;
  /* v8 ignore stop */
  // The pattern matches on digits, so what it captured always reads as a number.
  return { count: Number(digits.replace(",", ".")), unit, text };
}
