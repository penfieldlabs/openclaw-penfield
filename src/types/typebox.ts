/**
 * Centralized TypeBox exports and common schemas
 *
 * All tool schemas should import Type from here:
 *   import { Type } from "../types/typebox.js";
 */

import { Type, type TSchema } from "@sinclair/typebox";

// Re-export Type for schema definitions
export { Type, type TSchema };

// Common schemas
export const UUIDSchema = Type.String({
  description: "UUID format identifier",
  format: "uuid",
});

export const PaginationSchema = Type.Object({
  page: Type.Optional(Type.Number({
    description: "Page number (1-indexed)",
    minimum: 1,
    default: 1,
  })),
  limit: Type.Optional(Type.Number({
    description: "Items per page",
    minimum: 1,
    maximum: 100,
    default: 20,
  })),
});

export const ImportanceScoreSchema = Type.Number({
  description: "Importance score 0-1",
  minimum: 0,
  maximum: 1,
});

export const ConfidenceScoreSchema = Type.Number({
  description: "Confidence score 0-1",
  minimum: 0,
  maximum: 1,
});

export const TagsSchema = Type.Array(Type.String(), {
  description: "Tags for categorization",
  maxItems: 10,
});

export const MemoryTypeSchema = Type.Union([
  Type.Literal("fact"),
  Type.Literal("insight"),
  Type.Literal("conversation"),
  Type.Literal("correction"),
  Type.Literal("reference"),
  Type.Literal("task"),
  Type.Literal("checkpoint"),
  Type.Literal("identity_core"),
  Type.Literal("personality_trait"),
  Type.Literal("relationship"),
  Type.Literal("strategy"),
], { description: "Type of memory" });

export const RelationshipTypeSchema = Type.Union([
  // Knowledge Evolution
  Type.Literal("supersedes"),
  Type.Literal("updates"),
  Type.Literal("evolution_of"),
  // Evidence & Support
  Type.Literal("supports"),
  Type.Literal("contradicts"),
  Type.Literal("disputes"),
  // Hierarchy & Structure
  Type.Literal("parent_of"),
  Type.Literal("child_of"),
  Type.Literal("sibling_of"),
  // Cause & Prerequisites
  Type.Literal("causes"),
  Type.Literal("influenced_by"),
  Type.Literal("prerequisite_for"),
  // Implementation & Examples
  Type.Literal("implements"),
  Type.Literal("documents"),
  Type.Literal("example_of"),
  Type.Literal("tests"),
  // Conversation & Reference
  Type.Literal("responds_to"),
  Type.Literal("references"),
  Type.Literal("inspired_by"),
  // Sequence & Flow
  Type.Literal("follows"),
  Type.Literal("precedes"),
  // Dependencies & Composition
  Type.Literal("depends_on"),
  Type.Literal("composed_of"),
  Type.Literal("part_of"),
], {
  description: "Semantic relationship type connecting two memories",
  examples: ["supports", "parent_of", "evolution_of", "example_of", "depends_on"],
});
