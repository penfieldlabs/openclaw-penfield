/**
 * Centralized TypeBox exports and common schemas
 *
 * All tool schemas should import Type from here:
 *   import { Type } from "../types/typebox.js";
 */

import { Type } from "typebox";

// Re-export Type for schema definitions
export { Type };

// Common schemas
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
  description:
    "Up to ten distinct tags, each 2 to 50 characters after cleaning to lowercase ASCII letters, digits and hyphens",
});
const writableMemoryTypes = [
  "fact",
  "insight",
  "conversation",
  "correction",
  "reference",
  "task",
  "checkpoint",
  "relationship",
  "strategy",
];
export const WritableMemoryTypeSchema = Type.String({
  enum: writableMemoryTypes,
  description:
    "Memory type to write. Manage identity_core and personality_trait in the Penfield portal.",
});
export const MemoryTypeSchema = Type.String({
  enum: [...writableMemoryTypes, "identity_core", "personality_trait"],
  description: "Memory type to retrieve",
});
const searchableSourceTypes = [
  "direct_input",
  "conversation",
  "api_import",
  "checkpoint",
  "document_upload",
];
export const SearchSourceTypesSchema = Type.Array(Type.String({ enum: searchableSourceTypes }), {
  description: "Filter by memory source",
});
export const StoreSourceTypeSchema = Type.String({
  enum: [...searchableSourceTypes, "web_scrape", "reflection", "checkpoint_recall"],
  description: "Origin of the stored memory",
});

// Shared search parameter schemas (used by recall + search)
export const StartDateSchema = Type.String({
  description: "Filter memories created on or after this date (ISO 8601, e.g. '2025-01-01')",
});

export const EndDateSchema = Type.String({
  description: "Filter memories created on or before this date (ISO 8601, e.g. '2025-12-31')",
});

export const SortOrderSchema = Type.Union(
  [Type.Literal("relevance"), Type.Literal("created_desc"), Type.Literal("created_asc")],
  {
    description: 'Sort order: "relevance" (default), "created_desc", or "created_asc"',
    default: "relevance",
  }
);

export const MaxContentLengthSchema = Type.Number({
  description:
    "Truncate memory content to this many characters. Full content available via penfield_fetch.",
  minimum: 50,
  maximum: 10000,
});

export const RelationshipTypeSchema = Type.Union(
  [
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
  ],
  {
    description: "Semantic relationship type connecting two memories",
    examples: ["supports", "parent_of", "evolution_of", "example_of", "depends_on"],
  }
);
