import assert from "node:assert/strict";
import { calculateRetention } from "./retention";

const now = new Date("2026-10-11T12:00:00Z");
const day = 86_400_000;
const at = (days: number) => new Date(now.getTime() - days * day);
const visits = [
  { membershipId: "a", createdAt: at(1) },
  { membershipId: "a", createdAt: at(2) },
  { membershipId: "b", createdAt: at(3) },
  { membershipId: "a", createdAt: at(31) },
  { membershipId: "a", createdAt: at(32) },
  { membershipId: "ignored-old", createdAt: at(61) },
  { membershipId: "ignored-future", createdAt: at(-1) },
];
const result = calculateRetention(visits, at(90), now);
assert.equal(result.activeCustomers, 2);
assert.equal(result.repeatCustomers, 1);
assert.equal(result.repeatRate, 50);
assert.equal(result.previousRepeatRate, 100);
assert.equal(result.activeCustomerChange, 1);
assert.equal(result.repeatRateChange, -50);
assert.equal(result.comparisonAvailable, true);
assert.equal(result.weeks.at(-1)?.repeatRate, 50);
assert.equal(result.weeks.at(-1)?.activeCustomers, 2);
assert.equal(result.weeks[0].start, at(30).toISOString());
assert.equal(result.weeks.at(-1)?.end, now.toISOString());
assert.equal(calculateRetention(visits, at(20), now).comparisonAvailable, false);
const empty = calculateRetention([], at(90), now);
assert.equal(empty.repeatRate, 0);
assert.equal(empty.comparisonAvailable, false);
assert(empty.weeks.every(week => week.activeCustomers === 0));
// Half-open period bounds: exactly 30 days ago is current; exactly 60 is previous.
const boundaries = calculateRetention([
  { membershipId: "a", createdAt: at(30) },
  { membershipId: "b", createdAt: at(60) },
  { membershipId: "c", createdAt: now },
], at(90), now);
assert.equal(boundaries.activeCustomers, 1);
assert.equal(boundaries.previousActiveCustomers, 1);
console.log("PASS: retention periods, unique customers, weekly grouping, deltas, empty states and history eligibility.");
