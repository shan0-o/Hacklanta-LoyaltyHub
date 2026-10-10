---
name: Expo Router auth routes
description: Route-group behavior and route registration lessons for authentication screens.
---

In Expo Router, parenthesized route groups do not add URL path segments. Multiple group `index` screens can resolve to `/` and cause ambiguous blank routes; register auth as an explicit route leaf and keep app root unique.

**Why:** A duplicate auth/index route rendered a blank root screen even though the group-qualified route worked; the parent stack also did not resolve a group name without a matching nested layout.

**How to apply:** When adding guest auth beside tabs, use an explicit route such as `(auth)/sign-in`, keep root routes unambiguous, and declare the matching leaf screen or add a nested group layout.
