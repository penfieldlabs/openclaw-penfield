# HEARTBEAT

<!-- ============================================================
  PENFIELD TEMPLATE — Heartbeat Checklist

  This file runs on a timer (default: every 30 minutes). OpenClaw
  reads it and follows the checklist each cycle.

  CRITICAL: If this file is effectively empty (only blank lines
  and the header), OpenClaw skips the heartbeat entirely to save
  API calls. So if you want heartbeat to run, put SOMETHING here.

  Keep it SHORT. This injects into context every cycle. A bloated
  heartbeat wastes tokens 48 times a day.

  Penfield has nothing to do with heartbeat — this is purely
  OpenClaw operational. Keep it as-is and customize the checklist
  to your needs.
  ============================================================ -->

## Checklist

- Quick scan: anything urgent in inboxes?
- If daytime, do a lightweight check-in if nothing else is pending.
- If a task is blocked, write down what's missing and ask next time.

<!-- Add your own items below. Examples:
- Check home automation sensors for anomalies
- Scan calendar for upcoming events in the next 2 hours
- Review any pending pull requests
- Check server health dashboards
-->
