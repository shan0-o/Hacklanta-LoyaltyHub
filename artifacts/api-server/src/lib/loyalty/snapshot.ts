import { and, desc, eq, gte, inArray, sql, or } from "drizzle-orm";
import { calculateRetention } from "./retention";
import type {
  Business as ApiBusiness,
  Campaign as ApiCampaign,
  LoyaltySnapshot,
  Member as ApiMember,
  MerchantAnalytics,
  RecentTransaction,
} from "@workspace/api-zod";
import {
  db,
  loyaltyBusinesses,
  loyaltyCampaigns,
  loyaltyFavorites,
  loyaltyMemberships,
  loyaltyNotices,
  loyaltyTransactions,
  staffPinCredentials,
} from "@workspace/db";

const isCampaignInWindow = (
  campaign: typeof loyaltyCampaigns.$inferSelect,
  now: Date,
) =>
  campaign.active &&
  (!campaign.startAt || campaign.startAt <= now) &&
  (!campaign.endAt || campaign.endAt >= now);

function lastSevenUtcDays(now: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - (6 - index));
    return day.toISOString().slice(0, 10);
  });
}

export async function getLoyaltySnapshot(userId: string): Promise<LoyaltySnapshot> {
  const now = new Date();
  // Joined cards remain in the wallet even when the owner pauses a program.
  const joinedRows = await db.select({ business: loyaltyBusinesses })
    .from(loyaltyBusinesses)
    .innerJoin(loyaltyMemberships, eq(loyaltyMemberships.businessId, loyaltyBusinesses.id))
    .where(eq(loyaltyMemberships.userId, userId));
  const [ownedRows, publicRows, favoriteRows, noticeRows] = await Promise.all([
    db
      .select()
      .from(loyaltyBusinesses)
      .where(eq(loyaltyBusinesses.ownerUserId, userId)),
    db
      .select()
      .from(loyaltyBusinesses)
      .where(eq(loyaltyBusinesses.active, true)),
    db
      .select({ businessId: loyaltyFavorites.businessId })
      .from(loyaltyFavorites)
      .where(eq(loyaltyFavorites.userId, userId)),
    db
      .select()
      .from(loyaltyNotices)
      .where(eq(loyaltyNotices.userId, userId))
      .orderBy(desc(loyaltyNotices.createdAt))
      .limit(30),
  ]);

  const businessMap = new Map(
    [...publicRows, ...ownedRows, ...joinedRows.map(row => row.business)].map((business) => [business.id, business]),
  );
  const businesses = [...businessMap.values()].filter(business => !business.isDemo || business.ownerUserId === userId).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  if (businesses.length === 0) {
    return { businesses: [], favorites: [], notices: [] };
  }

  const businessIds = businesses.map((business) => business.id);
  const customerHistory = await db.select({
    id: loyaltyTransactions.id, businessId: loyaltyTransactions.businessId,
    memberName: loyaltyMemberships.displayName, type: loyaltyTransactions.type,
    stamps: loyaltyTransactions.stampDelta, description: loyaltyTransactions.description,
    createdAt: loyaltyTransactions.createdAt,
  }).from(loyaltyTransactions)
    .innerJoin(loyaltyMemberships, eq(loyaltyMemberships.id, loyaltyTransactions.membershipId))
    .where(eq(loyaltyMemberships.userId, userId))
    .orderBy(desc(loyaltyTransactions.createdAt)).limit(100);
  const [
    membershipRows,
    campaignRows,
    transactionSummaries,
    campaignUsage,
    pinRows,
  ] = await Promise.all([
      db
        .select()
        .from(loyaltyMemberships)
        .where(inArray(loyaltyMemberships.businessId, businessIds)),
      db
        .select()
        .from(loyaltyCampaigns)
        .where(inArray(loyaltyCampaigns.businessId, businessIds))
        .orderBy(desc(loyaltyCampaigns.createdAt)),
      db
        .select({
          membershipId: loyaltyTransactions.membershipId,
          lastVisitAt: sql<string | null>`max(${loyaltyTransactions.createdAt}) filter (where ${loyaltyTransactions.type} = 'stamp')`,
          visits: sql<number>`count(*) filter (where ${loyaltyTransactions.type} = 'stamp')::int`,
          lifetimeStamps: sql<number>`coalesce(sum(${loyaltyTransactions.stampDelta}) filter (where ${loyaltyTransactions.type} = 'stamp'), 0)::int`,
          redemptions: sql<number>`count(*) filter (where ${loyaltyTransactions.type} = 'redemption')::int`,
        })
        .from(loyaltyTransactions)
        .where(inArray(loyaltyTransactions.businessId, businessIds))
        .groupBy(loyaltyTransactions.membershipId),
      db
        .select({
          campaignId: loyaltyTransactions.campaignId,
          usageCount: sql<number>`count(*)::int`,
        })
        .from(loyaltyTransactions)
        .where(
          and(
            inArray(loyaltyTransactions.businessId, businessIds),
            eq(loyaltyTransactions.type, "stamp"),
            sql`${loyaltyTransactions.campaignId} is not null`,
          ),
        )
        .groupBy(loyaltyTransactions.campaignId),
      db
        .select({ businessId: staffPinCredentials.businessId })
        .from(staffPinCredentials)
        .where(inArray(staffPinCredentials.businessId, businessIds)),
    ]);

  const membershipSummary = new Map(
    transactionSummaries.map((summary) => [summary.membershipId, summary]),
  );
  const campaignUsageMap = new Map(
    campaignUsage.map((summary) => [summary.campaignId, summary.usageCount]),
  );
  const configuredPins = new Set(pinRows.map((row) => row.businessId));
  const membersByBusiness = new Map<string, typeof membershipRows>();
  for (const membership of membershipRows) {
    const list = membersByBusiness.get(membership.businessId) ?? [];
    list.push(membership);
    membersByBusiness.set(membership.businessId, list);
  }
  const campaignsByBusiness = new Map<string, typeof campaignRows>();
  for (const campaign of campaignRows) {
    const list = campaignsByBusiness.get(campaign.businessId) ?? [];
    list.push(campaign);
    campaignsByBusiness.set(campaign.businessId, list);
  }

  const activityByBusiness = new Map<
    string,
    { date: string; visits: number; stamps: number }[]
  >();
  const recentByBusiness = new Map<string, RecentTransaction[]>();
  const analyticsByBusiness = new Map<string, MerchantAnalytics>();
  const cutoff = new Date(now);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - 6);

  for (const business of businesses) {
    if (business.ownerUserId !== userId) continue;

    const [activityRows, recentRows, totals, retentionVisits] = await Promise.all([
      db
        .select({
          date: sql<string>`to_char(${loyaltyTransactions.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
          visits: sql<number>`count(*) filter (where ${loyaltyTransactions.type} = 'stamp')::int`,
          stamps: sql<number>`coalesce(sum(${loyaltyTransactions.stampDelta}) filter (where ${loyaltyTransactions.type} = 'stamp'), 0)::int`,
        })
        .from(loyaltyTransactions)
        .where(
          and(
            eq(loyaltyTransactions.businessId, business.id),
            gte(loyaltyTransactions.createdAt, cutoff),
          ),
        )
        .groupBy(
          sql`to_char(${loyaltyTransactions.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        )
        .orderBy(
          sql`to_char(${loyaltyTransactions.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        ),
      db
        .select({
          id: loyaltyTransactions.id,
          memberName: loyaltyMemberships.displayName,
          type: loyaltyTransactions.type,
          stampDelta: loyaltyTransactions.stampDelta,
          description: loyaltyTransactions.description,
          createdAt: loyaltyTransactions.createdAt,
        })
        .from(loyaltyTransactions)
        .innerJoin(
          loyaltyMemberships,
          eq(loyaltyMemberships.id, loyaltyTransactions.membershipId),
        )
        .where(eq(loyaltyTransactions.businessId, business.id))
        .orderBy(desc(loyaltyTransactions.createdAt))
        .limit(10),
      db
        .select({
          stamps: sql<number>`coalesce(sum(${loyaltyTransactions.stampDelta}) filter (where ${loyaltyTransactions.type} = 'stamp'), 0)::int`,
          redemptions: sql<number>`count(*) filter (where ${loyaltyTransactions.type} = 'redemption')::int`,
        })
        .from(loyaltyTransactions)
        .where(eq(loyaltyTransactions.businessId, business.id)),
      db.select({
        membershipId: loyaltyTransactions.membershipId,
        createdAt: loyaltyTransactions.createdAt,
      }).from(loyaltyTransactions).where(and(
        eq(loyaltyTransactions.businessId, business.id),
        eq(loyaltyTransactions.type, "stamp"),
        gte(loyaltyTransactions.createdAt, new Date(now.getTime() - 60 * 86_400_000)),
      )),
    ]);

    const businessMembers = membersByBusiness.get(business.id) ?? [];
    const summaryRows = businessMembers.map(
      (membership) => membershipSummary.get(membership.id),
    );
    const repeatMembers = summaryRows.filter(
      (summary) => (summary?.visits ?? 0) >= 2,
    ).length;
    const businessCampaigns = campaignsByBusiness.get(business.id) ?? [];
    const days = lastSevenUtcDays(now);
    const activityMap = new Map(activityRows.map((row) => [row.date, row]));
    activityByBusiness.set(
      business.id,
      days.map((date) => ({
        date,
        visits: activityMap.get(date)?.visits ?? 0,
        stamps: activityMap.get(date)?.stamps ?? 0,
      })),
    );

    const recentTransactions: RecentTransaction[] = recentRows.map((row) => ({
      id: row.id,
      memberName: row.memberName,
      type: row.type as "stamp" | "redemption",
      stamps: Math.abs(row.stampDelta),
      description: row.description,
      createdAt: row.createdAt.toISOString(),
    }));
    recentByBusiness.set(business.id, recentTransactions);

    analyticsByBusiness.set(business.id, {
      retention: calculateRetention(retentionVisits, business.createdAt, now),
      approvedVisits: summaryRows.reduce((sum, row) => sum + (row?.visits ?? 0), 0),
      rewardsAvailable: businessMembers.reduce((sum, member) => sum + Math.floor(member.stampBalance / business.goal), 0),
      activePromotions: businessCampaigns.filter(campaign => campaign.type === "Promotion" && isCampaignInWindow(campaign, now)).length,
      members: businessMembers.length,
      stamps: totals[0]?.stamps ?? 0,
      redemptions: totals[0]?.redemptions ?? 0,
      repeatPercent: businessMembers.length
        ? Math.round((repeatMembers / businessMembers.length) * 100)
        : 0,
      activeCampaigns: businessCampaigns.filter((campaign) =>
        isCampaignInWindow(campaign, now),
      ).length,
      newMembers: businessMembers.filter(
        (member) =>
          now.getTime() - member.joinedAt.getTime() <= 30 * 24 * 60 * 60 * 1000,
      ).length,
      activity: [],
      recentTransactions,
    });
    const analytics = analyticsByBusiness.get(business.id)!;
    analytics.activity = activityByBusiness.get(business.id)!;
  }

  const snapshotBusinesses: ApiBusiness[] = businesses.map((business) => {
    const isOwner = business.ownerUserId === userId;
    const businessMembers = membersByBusiness.get(business.id) ?? [];
    const visibleMembers = isOwner
      ? businessMembers
      : businessMembers.filter((member) => member.userId === userId);
    const businessCampaigns = campaignsByBusiness.get(business.id) ?? [];
    const visibleCampaigns = isOwner
      ? businessCampaigns
      : businessCampaigns.filter(
          (campaign) => campaign.active && (!campaign.endAt || campaign.endAt >= now),
        );
    const memberList: ApiMember[] = visibleMembers.map((membership) => {
      const summary = membershipSummary.get(membership.id);
      const lifetimeStamps = summary?.lifetimeStamps ?? 0;
      return {
        id: membership.id,
        ...(isOwner ? {
          joinedAt: membership.joinedAt.toISOString(),
          lastVisitAt: summary?.lastVisitAt ? new Date(summary.lastVisitAt).toISOString() : null,
        } : {}),
        name: membership.displayName,
        points: lifetimeStamps * 10,
        stamps: membership.stampBalance,
        visits: summary?.visits ?? 0,
        redemptions: summary?.redemptions ?? 0,
        lifetimeStamps,
        isCurrentUser: membership.userId === userId,
      };
    });
    const campaignList: ApiCampaign[] = visibleCampaigns.map((campaign) => ({
      id: campaign.id,
      type: campaign.type as ApiCampaign["type"],
      title: campaign.title,
      description: campaign.description,
      active: campaign.active,
      startAt: campaign.startAt?.toISOString() ?? null,
      endAt: campaign.endAt?.toISOString() ?? null,
      multiplier: campaign.multiplier,
      bonusStamps: campaign.bonusStamps,
      usageCount: isOwner ? campaignUsageMap.get(campaign.id) ?? 0 : 0,
    }));

    return {
      id: business.id,
      logoUrl: business.logoUrl,
      history: customerHistory.filter(row => row.businessId === business.id).map(row => ({
        id: row.id, memberName: row.memberName, type: row.type as "stamp" | "redemption",
        stamps: Math.abs(row.stamps), description: row.description, createdAt: row.createdAt.toISOString(),
      })),
      name: business.name,
      category: business.category,
      location: business.location,
      description: business.description,
      programName: business.programName,
      goal: business.goal,
      rewardDescription: business.rewardDescription,
      terms: business.terms,
      active: business.active,
      isDemo: business.isDemo,
      isOwner,
      staffPinConfigured: configuredPins.has(business.id),
      members: memberList,
      campaigns: campaignList,
      analytics: isOwner ? analyticsByBusiness.get(business.id) ?? null : null,
    };
  });

  return {
    businesses: snapshotBusinesses,
    favorites: favoriteRows.filter(row => businessIds.includes(row.businessId)).map((row) => row.businessId),
    notices: noticeRows.filter(row => businessIds.includes(row.businessId)).map((notice) => ({
      id: notice.id,
      businessId: notice.businessId,
      message: notice.message,
      read: notice.read,
      createdAt: notice.createdAt.toISOString(),
    })),
  };
}
