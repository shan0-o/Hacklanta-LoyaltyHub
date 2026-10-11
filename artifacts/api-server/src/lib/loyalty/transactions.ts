import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import type { RedemptionResult, StampResult } from "@workspace/api-zod";
import {
  db,
  loyaltyBusinesses,
  loyaltyCampaigns,
  loyaltyMemberships,
  loyaltyNotices,
  loyaltyTransactions,
} from "@workspace/db";
import { verifyStaffPin } from "./security";

export type ActionStatus =
  | "ok"
  | "already-approved"
  | "invalid-pin"
  | "pin-locked"
  | "pin-unconfigured"
  | "not-member"
  | "business-unavailable"
  | "insufficient-stamps"
  | "idempotency-conflict";

export type ActionOutcome<T> =
  | { status: "pin-locked"; retryAfterSeconds: number }
  | { status: Exclude<ActionStatus, "pin-locked">; result?: T };

async function findIdempotentTransaction(
  idempotencyKey: string,
  businessId: string,
  membershipId: string,
  type: "stamp" | "redemption",
) {
  const [existing] = await db
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!existing) return { conflict: false, existing: null };
  if (
    existing.businessId !== businessId ||
    existing.membershipId !== membershipId ||
    existing.type !== type
  ) {
    return { conflict: true, existing: null };
  }
  return { conflict: false, existing };
}

function pinStatus(status: Awaited<ReturnType<typeof verifyStaffPin>>["status"]) {
  if (status === "ok") return null;
  if (status === "invalid") return "invalid-pin" as const;
  if (status === "locked") return "pin-locked" as const;
  return "pin-unconfigured" as const;
}

export async function requestCustomerStamp(
  userId: string,
  businessId: string,
  staffPin: string,
  idempotencyKey: string,
): Promise<ActionOutcome<StampResult>> {
  const [business] = await db
    .select()
    .from(loyaltyBusinesses)
    .where(
      and(
        eq(loyaltyBusinesses.id, businessId),
        eq(loyaltyBusinesses.active, true),
      ),
    )
    .limit(1);
  if (!business) return { status: "business-unavailable" };

  const [membership] = await db
    .select()
    .from(loyaltyMemberships)
    .where(
      and(
        eq(loyaltyMemberships.businessId, businessId),
        eq(loyaltyMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return { status: "not-member" };

  const prior = await findIdempotentTransaction(
    idempotencyKey,
    businessId,
    membership.id,
    "stamp",
  );
  if (prior.conflict) return { status: "idempotency-conflict" };
  if (prior.existing) {
    return {
      status: "already-approved",
      result: {
        transactionId: prior.existing.id,
        awardedStamps: prior.existing.stampDelta,
        stampBalance: membership.stampBalance,
        rewardReady: membership.stampBalance >= business.goal,
        message: "This stamp request was already approved.",
      },
    };
  }

  const authorization = await verifyStaffPin(businessId, staffPin);
  const authorizationError = pinStatus(authorization.status);
  if (authorizationError === "pin-locked") {
    return {
      status: "pin-locked",
      retryAfterSeconds:
        authorization.status === "locked"
          ? authorization.retryAfterSeconds
          : 0,
    };
  }
  if (authorizationError) return { status: authorizationError };

  const outcome = await db.transaction(async (tx) => {
    const [lockedBusiness] = await tx
      .select()
      .from(loyaltyBusinesses)
      .where(
        and(
          eq(loyaltyBusinesses.id, businessId),
          eq(loyaltyBusinesses.active, true),
        ),
      )
      .for("share")
      .limit(1);
    if (!lockedBusiness) return { status: "business-unavailable" as const };

    const [lockedMember] = await tx
      .select()
      .from(loyaltyMemberships)
      .where(
        and(
          eq(loyaltyMemberships.id, membership.id),
          eq(loyaltyMemberships.userId, userId),
        ),
      )
      .for("update")
      .limit(1);
    if (!lockedMember) return { status: "not-member" as const };

    const [duplicate] = await tx
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.idempotencyKey, idempotencyKey))
      .limit(1);
    if (duplicate) {
      if (
        duplicate.businessId !== businessId ||
        duplicate.membershipId !== lockedMember.id ||
        duplicate.type !== "stamp"
      ) {
        return { status: "idempotency-conflict" as const };
      }
      return {
        status: "already-approved" as const,
        result: {
          transactionId: duplicate.id,
          awardedStamps: duplicate.stampDelta,
          stampBalance: lockedMember.stampBalance,
          rewardReady: lockedMember.stampBalance >= lockedBusiness.goal,
          message: "This stamp request was already approved.",
        },
      };
    }

    const now = new Date();
    const [promotion] = await tx
      .select()
      .from(loyaltyCampaigns)
      .where(
        and(
          eq(loyaltyCampaigns.businessId, businessId),
          eq(loyaltyCampaigns.type, "Promotion"),
          eq(loyaltyCampaigns.active, true),
          or(isNull(loyaltyCampaigns.startAt), lte(loyaltyCampaigns.startAt, now)),
          or(isNull(loyaltyCampaigns.endAt), gte(loyaltyCampaigns.endAt, now)),
        ),
      )
      .orderBy(desc(loyaltyCampaigns.createdAt))
      .limit(1);

    // Exactly one currently eligible promotion is applied. Overlapping offers never stack.
    const awardedStamps = promotion
      ? promotion.multiplier + promotion.bonusStamps
      : 1;
    const nextBalance = lockedMember.stampBalance + awardedStamps;
    const transactionId = randomUUID();
    const description = promotion
      ? `${promotion.title} · ${awardedStamps} stamps`
      : "Approved visit · 1 stamp";
    const inserted = await tx
      .insert(loyaltyTransactions)
      .values({
        id: transactionId,
        businessId,
        membershipId: lockedMember.id,
        type: "stamp",
        stampDelta: awardedStamps,
        campaignId: promotion?.id ?? null,
        idempotencyKey,
        description,
      })
      .onConflictDoNothing()
      .returning({ id: loyaltyTransactions.id });
    if (inserted.length === 0) {
      return { status: "idempotency-conflict" as const };
    }

    await tx
      .update(loyaltyMemberships)
      .set({ stampBalance: nextBalance })
      .where(eq(loyaltyMemberships.id, lockedMember.id));

    const previousRewards = Math.floor(
      lockedMember.stampBalance / lockedBusiness.goal,
    );
    const nextRewards = Math.floor(nextBalance / lockedBusiness.goal);
    if (nextRewards > previousRewards) {
      await tx.insert(loyaltyNotices).values({
        id: randomUUID(),
        userId,
        businessId,
        message: `A reward is ready at ${lockedBusiness.name}.`,
      });
    }

    return {
      status: "ok" as const,
      result: {
        transactionId,
        awardedStamps,
        stampBalance: nextBalance,
        rewardReady: nextBalance >= lockedBusiness.goal,
        message: promotion
          ? `${promotion.title}: ${awardedStamps} stamp${awardedStamps === 1 ? "" : "s"} added.`
          : "One stamp added to your card.",
      },
    };
  });

  return outcome;
}

export async function redeemCustomerReward(
  userId: string,
  businessId: string,
  staffPin: string,
  idempotencyKey: string,
): Promise<ActionOutcome<RedemptionResult>> {
  const [business] = await db
    .select()
    .from(loyaltyBusinesses)
    .where(
      and(
        eq(loyaltyBusinesses.id, businessId),
        eq(loyaltyBusinesses.active, true),
      ),
    )
    .limit(1);
  if (!business) return { status: "business-unavailable" };

  const [membership] = await db
    .select()
    .from(loyaltyMemberships)
    .where(
      and(
        eq(loyaltyMemberships.businessId, businessId),
        eq(loyaltyMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return { status: "not-member" };

  const prior = await findIdempotentTransaction(
    idempotencyKey,
    businessId,
    membership.id,
    "redemption",
  );
  if (prior.conflict) return { status: "idempotency-conflict" };
  if (prior.existing) {
    return {
      status: "already-approved",
      result: {
        transactionId: prior.existing.id,
        remainingStamps: membership.stampBalance,
        rewardDescription: prior.existing.description,
        message: "This reward was already redeemed.",
      },
    };
  }

  const authorization = await verifyStaffPin(businessId, staffPin);
  const authorizationError = pinStatus(authorization.status);
  if (authorizationError === "pin-locked") {
    return {
      status: "pin-locked",
      retryAfterSeconds:
        authorization.status === "locked"
          ? authorization.retryAfterSeconds
          : 0,
    };
  }
  if (authorizationError) return { status: authorizationError };

  return db.transaction(async (tx) => {
    const [lockedBusiness] = await tx
      .select()
      .from(loyaltyBusinesses)
      .where(
        and(
          eq(loyaltyBusinesses.id, businessId),
          eq(loyaltyBusinesses.active, true),
        ),
      )
      .for("share")
      .limit(1);
    if (!lockedBusiness) return { status: "business-unavailable" as const };

    const [lockedMember] = await tx
      .select()
      .from(loyaltyMemberships)
      .where(
        and(
          eq(loyaltyMemberships.id, membership.id),
          eq(loyaltyMemberships.userId, userId),
        ),
      )
      .for("update")
      .limit(1);
    if (!lockedMember) return { status: "not-member" as const };

    const [duplicate] = await tx
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.idempotencyKey, idempotencyKey))
      .limit(1);
    if (duplicate) {
      if (
        duplicate.businessId !== businessId ||
        duplicate.membershipId !== lockedMember.id ||
        duplicate.type !== "redemption"
      ) {
        return { status: "idempotency-conflict" as const };
      }
      return {
        status: "already-approved" as const,
        result: {
          transactionId: duplicate.id,
          remainingStamps: lockedMember.stampBalance,
          rewardDescription: duplicate.description,
          message: "This reward was already redeemed.",
        },
      };
    }

    if (lockedMember.stampBalance < lockedBusiness.goal) {
      return { status: "insufficient-stamps" as const };
    }

    const remainingStamps = lockedMember.stampBalance - lockedBusiness.goal;
    const transactionId = randomUUID();
    const inserted = await tx
      .insert(loyaltyTransactions)
      .values({
        id: transactionId,
        businessId,
        membershipId: lockedMember.id,
        type: "redemption",
        stampDelta: -lockedBusiness.goal,
        campaignId: null,
        idempotencyKey,
        description: lockedBusiness.rewardDescription,
      })
      .onConflictDoNothing()
      .returning({ id: loyaltyTransactions.id });
    if (inserted.length === 0) {
      return { status: "idempotency-conflict" as const };
    }

    await tx
      .update(loyaltyMemberships)
      .set({ stampBalance: remainingStamps })
      .where(eq(loyaltyMemberships.id, lockedMember.id));
    await tx
      .update(loyaltyNotices)
      .set({ read: true })
      .where(
        and(
          eq(loyaltyNotices.userId, userId),
          eq(loyaltyNotices.businessId, businessId),
          eq(loyaltyNotices.read, false),
        ),
      );
    if (remainingStamps >= lockedBusiness.goal) {
      await tx.insert(loyaltyNotices).values({
        id: randomUUID(),
        userId,
        businessId,
        message: `Another reward is ready at ${lockedBusiness.name}.`,
      });
    }

    return {
      status: "ok" as const,
      result: {
        transactionId,
        remainingStamps,
        rewardDescription: lockedBusiness.rewardDescription,
        message: "Reward redeemed. Your remaining stamps stay on the card.",
      },
    };
  });
}
