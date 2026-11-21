import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";

export const httpsUrl = Type.String({ pattern: "^https://[^\\s/?#@]+(?:[/?#][^\\s]*)?$" });

export function parseSchema<S extends TSchema>(
  schema: S,
  value: unknown,
  label: string
): Static<S> {
  if (Check(schema, value)) return value;
  const reasons = Errors(schema, value).map((e) => {
    const field = e.instancePath || "value";
    if (e.keyword === "enum") {
      const note =
        field === "/memory_type"
          ? " Manage identity_core and personality_trait in the Penfield portal."
          : "";
      return `${field} must be one of: ${e.params.allowedValues.join(", ")}.${note}`;
    }
    return `${field} ${e.message}`;
  });
  throw new Error(`Invalid ${label}. ${reasons.join(". ")}`);
}
