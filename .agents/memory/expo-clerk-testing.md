---
name: Expo Clerk test login
description: Single-use Clerk testing tasks across separate Expo and shared preview origins.
---

Programmatic Clerk testing tasks are single-use. A task consumed on the shared preview origin cannot be reused to authenticate the Expo origin.

**Why:** Browser testing first consumed a task on the wrong host; retrying it on Expo produced `agent_task_already_used`.

**How to apply:** For Expo testing, generate a fresh helper URL and replace only its origin with the Expo origin before the first navigation, preserving the path and query. Do not store or report the ticket. The accepted task may redirect to the shared app origin; report which origin was actually tested and do not claim physical-device coverage.
