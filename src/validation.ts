/**
 * Input validation utilities for Penfield tools
 *
 * Defense-in-depth: Server validates too, but client-side validation
 * provides better UX (fail fast) and prevents malformed requests.
 */

/** Return a usable Penfield tag when the value has one. */
export function cleanTag(value: string): string | undefined {
  const tag = value
    .trim()
    .toLowerCase()
    .replace(/[ _]/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return tag.length >= 2 && tag.length <= 50 ? tag : undefined;
}

export function cleanTags(values: string[]): string[] {
  const tags = new Set<string>();
  for (const [index, value] of values.entries()) {
    const tag = cleanTag(value);
    if (!tag)
      throw new Error(
        `Tag ${index + 1} must be 2 to 50 characters after cleaning. Use ASCII letters, digits and hyphens.`
      );
    tags.add(tag);
  }
  if (tags.size > 10) throw new Error("A memory accepts up to 10 distinct tags after cleaning.");
  return [...tags];
}

// UUID v4 format: 8-4-4-4-12 hex digits
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check whether a string is a valid UUID format (non-throwing).
 * Use for conditional checks where invalid input should be skipped, not rejected.
 */
export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Validate that a string is a valid UUID format.
 * Prevents path traversal attacks in URL interpolation.
 *
 * @throws Error if not a valid UUID
 */
export function validateUuid(value: string, fieldName: string): void {
  if (!isUuid(value)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID format`);
  }
}

/** Validate a file path or a directory prefix before sending it to Penfield. */
export function validateArtifactPath(path: string, directory = false): void {
  if (typeof path !== "string" || !path.startsWith("/"))
    throw new Error("Artifact path must start with /.");
  if (directory && path === "/") return;
  const parts = (directory ? path.replace(/\/$/, "") : path).slice(1).split("/");
  if (parts.length > (directory ? 10 : 11))
    throw new Error("Artifact paths support at most ten folders.");
  if (
    path.includes("..") ||
    parts.some((part) => !part || part.startsWith(".") || !/^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    throw new Error(
      "Use visible file and folder names containing letters, digits, dots, dashes or underscores."
    );
  }
}
