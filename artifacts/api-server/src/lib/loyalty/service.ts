import { and, desc, eq, inArray, or } from "drizzle-orm";
import type {
  Business as ApiBusiness,
  BusinessInput,
  BusinessUpdate,
  Campaign as ApiCampaign,
  CampaignInput,
  FavoriteResult,
  LoyaltySnapshot,
} from "@workspace/api-zod";
import {
  db,
  loyaltyBusinesses,
  loyaltyCampaigns,
  loyaltyFavorites,
  loyaltyMemberships,
  loyaltyNotices,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import { currentStaffPin } from "./security";
import { getLoyaltySnapshot } from "./snapshot";

export async function createBusiness(
  ownerUserId: string,
  input: BusinessInput,
): Promise<ApiBusiness> {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(loyaltyBusinesses).values({
      id,
      ownerUserId,
      name: input.name.trim(),
      logoUrl: input.logoUrl ?? "",
      category: input.category.trim(),
      location: input.location.trim(),
      description: input.description.trim(),
      programName: input.programName.trim(),
      goal: input.goal,
      rewardDescription: input.rewardDescription.trim(),
      terms: input.terms.trim(),
      active: true,
    });
  });
  await currentStaffPin(id, ownerUserId);
  const snapshot = await getLoyaltySnapshot(ownerUserId);
  const created = snapshot.businesses.find((business) => business.id === id);
  if (!created) throw new Error("Created business was not available in its snapshot");
  return created;
}

export async function updateBusiness(
  ownerUserId: string,
  businessId: string,
  input: BusinessUpdate,
): Promise<ApiBusiness | null> {
  const [business] = await db
    .select({ id: loyaltyBusinesses.id })
    .from(loyaltyBusinesses)
    .where(
      and(
        eq(loyaltyBusinesses.id, businessId),
        eq(loyaltyBusinesses.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);
  if (!business) return null;

  const updates: Partial<typeof loyaltyBusinesses.$inferInsert> = {};
  if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl;
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.category !== undefined) updates.category = input.category.trim();
  if (input.location !== undefined) updates.location = input.location.trim();
  if (input.description !== undefined)
    updates.description = input.description.trim();
  if (input.programName !== undefined)
    updates.programName = input.programName.trim();
  if (input.goal !== undefined) updates.goal = input.goal;
  if (input.rewardDescription !== undefined)
    updates.rewardDescription = input.rewardDescription.trim();
  if (input.terms !== undefined) updates.terms = input.terms.trim();
  if (input.active !== undefined) updates.active = input.active;

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx
        .update(loyaltyBusinesses)
        .set(updates)
        .where(eq(loyaltyBusinesses.id, businessId));
    }
  });

  const snapshot = await getLoyaltySnapshot(ownerUserId);
  return snapshot.businesses.find((item) => item.id === businessId) ?? null;
}

function toApiCampaign(
  campaign: typeof loyaltyCampaigns.$inferSelect,
  usageCount = 0,
): ApiCampaign {
  return {
    id: campaign.id,
    type: campaign.type as ApiCampaign["type"],
    title: campaign.title,
    description: campaign.description,
    active: campaign.active,
    startAt: campaign.startAt?.toISOString() ?? null,
    endAt: campaign.endAt?.toISOString() ?? null,
    multiplier: campaign.multiplier,
    bonusStamps: campaign.bonusStamps,
    usageCount,
  };
}

function campaignValues(input: CampaignInput) {
  const startAt = input.startAt ? new Date(input.startAt) : null;
  const endAt = input.endAt ? new Date(input.endAt) : null;
  if (
    (startAt && Number.isNaN(startAt.getTime())) ||
    (endAt && Number.isNaN(endAt.getTime())) ||
    (startAt && endAt && endAt <= startAt)
  ) {
    throw new Error("Campaign dates are invalid or the end is not after the start.");
  }
  if (
    input.type !== "Promotion" &&
    (input.multiplier !== 1 || input.bonusStamps !== 0)
  ) {
    throw new Error("Only promotions can change the number of stamps awarded.");
  }
  if (input.multiplier > 1 && input.bonusStamps > 0) {
    throw new Error("Choose either a stamp multiplier or bonus stamps, not both.");
  }
  return {
    type: input.type,
    title: input.title.trim(),
    description: input.description.trim(),
    active: input.active,
    startAt,
    endAt,
    multiplier: input.multiplier,
    bonusStamps: input.bonusStamps,
  };
}

export async function createCampaign(
  ownerUserId: string,
  businessId: string,
  input: CampaignInput,
): Promise<ApiCampaign | null> {
  const [business] = await db
    .select({ id: loyaltyBusinesses.id })
    .from(loyaltyBusinesses)
    .where(
      and(
        eq(loyaltyBusinesses.id, businessId),
        eq(loyaltyBusinesses.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);
  if (!business) return null;

  const [created] = await db
    .insert(loyaltyCampaigns)
    .values({ id: randomUUID(), businessId, ...campaignValues(input) })
    .returning();
  return toApiCampaign(created);
}

export async function updateCampaign(
  ownerUserId: string,
  campaignId: string,
  input: CampaignInput,
): Promise<ApiCampaign | null> {
  const [campaign] = await db
    .select({ campaign: loyaltyCampaigns })
    .from(loyaltyCampaigns)
    .innerJoin(
      loyaltyBusinesses,
      eq(loyaltyBusinesses.id, loyaltyCampaigns.businessId),
    )
    .where(
      and(
        eq(loyaltyCampaigns.id, campaignId),
        eq(loyaltyBusinesses.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);
  if (!campaign) return null;

  const [updated] = await db
    .update(loyaltyCampaigns)
    .set(campaignValues(input))
    .where(eq(loyaltyCampaigns.id, campaignId))
    .returning();
  return updated ? toApiCampaign(updated) : null;
}

export async function deleteCampaign(
  ownerUserId: string,
  campaignId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(loyaltyCampaigns)
    .where(
      and(
        eq(loyaltyCampaigns.id, campaignId),
        inArray(
          loyaltyCampaigns.businessId,
          db
            .select({ id: loyaltyBusinesses.id })
            .from(loyaltyBusinesses)
            .where(eq(loyaltyBusinesses.ownerUserId, ownerUserId)),
        ),
      ),
    )
    .returning({ id: loyaltyCampaigns.id });
  return deleted.length > 0;
}

export async function joinBusiness(
  userId: string,
  displayName: string,
  businessId: string,
): Promise<boolean> {
  const [business] = await db
    .select({ id: loyaltyBusinesses.id })
    .from(loyaltyBusinesses)
    .where(
      and(
        eq(loyaltyBusinesses.id, businessId),
        eq(loyaltyBusinesses.active, true),
        or(eq(loyaltyBusinesses.isDemo, false), eq(loyaltyBusinesses.ownerUserId, userId)),
      ),
    )
    .limit(1);
  if (!business) return false;

  await db
    .insert(loyaltyMemberships)
    .values({
      id: randomUUID(),
      businessId,
      userId,
      displayName: displayName.trim(),
    })
    .onConflictDoUpdate({
      target: [loyaltyMemberships.businessId, loyaltyMemberships.userId],
      set: { displayName: displayName.trim() },
    });
  return true;
}

export async function setFavorite(
  userId: string,
  businessId: string,
  favorite: boolean,
): Promise<FavoriteResult | null> {
  const [business] = await db
    .select({ id: loyaltyBusinesses.id })
    .from(loyaltyBusinesses)
    .where(
      and(
        eq(loyaltyBusinesses.id, businessId),
        eq(loyaltyBusinesses.active, true),
        or(eq(loyaltyBusinesses.isDemo, false), eq(loyaltyBusinesses.ownerUserId, userId)),
      ),
    )
    .limit(1);
  if (!business) return null;

  if (favorite) {
    await db
      .insert(loyaltyFavorites)
      .values({ userId, businessId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(loyaltyFavorites)
      .where(
        and(
          eq(loyaltyFavorites.userId, userId),
          eq(loyaltyFavorites.businessId, businessId),
        ),
      );
  }
  return { favorite };
}

export async function markNoticeRead(
  userId: string,
  noticeId: string,
): Promise<boolean> {
  const updated = await db
    .update(loyaltyNotices)
    .set({ read: true })
    .where(
      and(
        eq(loyaltyNotices.id, noticeId),
        eq(loyaltyNotices.userId, userId),
      ),
    )
    .returning({ id: loyaltyNotices.id });
  return updated.length > 0;
}

export async function getSnapshotBusiness(
  userId: string,
  businessId: string,
): Promise<ApiBusiness | null> {
  const snapshot: LoyaltySnapshot = await getLoyaltySnapshot(userId);
  return snapshot.businesses.find((business) => business.id === businessId) ?? null;
}
