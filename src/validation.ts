/**
 * Input validation utilities for Penfield tools
 *
 * Defense-in-depth: Server validates too, but client-side validation
 * provides better UX (fail fast) and prevents malformed requests.
 */

// UUID v4 format: 8-4-4-4-12 hex digits
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID format.
 * Prevents path traversal attacks in URL interpolation.
 *
 * @throws Error if not a valid UUID
 */
export function validateUuid(value: string, fieldName: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID format`);
  }
}

/**
 * Validate artifact path for safety.
 * Prevents path traversal and ensures proper format.
 *
 * @throws Error if path is invalid
 */
export function validateArtifactPath(path: string): void {
  if (!path || typeof path !== 'string') {
    throw new Error('Artifact path is required');
  }

  if (path.includes('..')) {
    throw new Error('Artifact path cannot contain ".." (path traversal not allowed)');
  }

  if (!path.startsWith('/')) {
    throw new Error('Artifact path must be absolute (start with "/")');
  }

  // Prevent null bytes and other control characters
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i);
    if (code < 32) {
      throw new Error('Artifact path contains invalid characters');
    }
  }
}
