---
name: Expo Clerk test login
description: Single-use Clerk testing tasks across separate Expo and shared preview origins.
---

Programmatic Clerk testing tasks are single-use. Preserve the helper's sign-in URL, including its origin.

**Why:** Replacing the origin sent Clerk's `/v1/agents/tasks` path to Expo and produced a not-found screen. A previous apparent success led to incorrect guidance; the standard, unmodified helper URL was subsequently verified.

**How to apply:** Use a fresh, unmodified helper URL and follow Clerk's redirect to the authenticated app. The shared preview host serves this app, but its session may not transfer to the Expo host. Report the actual host tested and do not claim physical-device coverage. Never store or report the login ticket.

Avoid revealing staff codes during screenshot-based tests; visual masking does not guarantee accessibility snapshots omit input values.

**Why:** A testing observation captured a demo code. The exact test credential was expired immediately afterward.

**How to apply:** Prefer backend tests for code content, keep merchant codes hidden in screenshots, and invalidate only the test credential if testing captures it.
