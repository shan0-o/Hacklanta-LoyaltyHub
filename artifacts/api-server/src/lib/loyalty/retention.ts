const DAY = 86_400_000;
type Visit = { membershipId: string; createdAt: Date };

// Each row is one authorized stamp transaction, never a stamp quantity.
export function calculateRetention(visits: Visit[], businessCreatedAt: Date, now = new Date()) {
  const end = now.getTime();
  const start = end - 30 * DAY;
  const previousStart = start - 30 * DAY;
  function period(from: number, to: number) {
    const counts = new Map<string, number>();
    for (const visit of visits) {
      const at = visit.createdAt.getTime();
      if (at >= from && at < to) counts.set(visit.membershipId, (counts.get(visit.membershipId) ?? 0) + 1);
    }
    const activeCustomers = counts.size;
    const repeatCustomers = [...counts.values()].filter(count => count >= 2).length;
    return { activeCustomers, repeatCustomers, repeatRate: activeCustomers ? repeatCustomers / activeCustomers * 100 : 0 };
  }
  const current = period(start, end);
  const previous = period(previousStart, start);
  const weeks = [];
  let cursor = start;
  while (cursor < end) {
    const nextMonday = new Date(cursor);
    nextMonday.setUTCHours(0, 0, 0, 0);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + (8 - nextMonday.getUTCDay()) % 7);
    if (nextMonday.getTime() <= cursor) nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    const next = Math.min(nextMonday.getTime(), end);
    weeks.push({ start: new Date(cursor).toISOString(), end: new Date(next).toISOString(), ...period(cursor, next) });
    cursor = next;
  }
  return {
    ...current,
    previousActiveCustomers: previous.activeCustomers,
    previousRepeatRate: previous.repeatRate,
    comparisonAvailable: businessCreatedAt.getTime() <= previousStart && previous.activeCustomers > 0,
    activeCustomerChange: current.activeCustomers - previous.activeCustomers,
    repeatRateChange: current.repeatRate - previous.repeatRate,
    weeks,
  };
}
