import type { Json } from "./database.types";

export function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJson(entry));
  }

  if (typeof value === "object") {
    const result: { [key: string]: Json | undefined } = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        result[key] = toJson(entry);
      }
    }
    return result;
  }

  throw new Error("Value cannot be represented as JSON.");
}
