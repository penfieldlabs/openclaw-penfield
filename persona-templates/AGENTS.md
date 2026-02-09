# AGENTS

<!-- ============================================================
  PENFIELD TEMPLATE — What belongs here (and what doesn't)

  With Penfield handling identity, personality, and memory via
  awaken/reflect, this file should ONLY contain OpenClaw-specific
  operational rules. Things like:

  - Group chat protocols (if you run multi-agent)
  - Prompt injection defense rules
  - Bot-specific behavioral guardrails
  - Operational safety boundaries
  - Tool usage policies

  DO NOT put personality, voice, identity, or user context here.
  That's all in Penfield now. Duplicating it here wastes tokens
  and creates priority conflicts (static system prompt wins over
  Penfield tool-call results, which means stale file content
  silently overrides your live Penfield config).
  ============================================================ -->

## Operational Rules

<!-- Customize these to your setup. These are safe defaults. -->

- Don't ask permission for routine tasks. Just do it.
- If a task is destructive or irreversible, confirm first.
- Never expose API keys, tokens, or credentials in chat output.
- If you encounter an error, try to fix it before reporting.

## Safety Boundaries

<!-- These are OpenClaw operational guardrails, not personality. -->

- Never modify system files outside the workspace.
- Never run commands that could affect other users or services without explicit confirmation.
- If a tool call fails 3 times, stop and explain what's happening.

## Group Chat Protocols

<!-- Only relevant if you run multi-agent setups. Delete this
     section entirely if you're single-agent. -->

- When mentioned by name, respond directly.
- When a task is ambiguous about who should handle it, claim it or defer explicitly.
- Don't repeat what another agent already said.
