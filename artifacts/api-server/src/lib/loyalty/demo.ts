import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  loyaltyBusinesses,
  loyaltyCampaigns,
  loyaltyMemberships,
  loyaltyTransactions,
} from "@workspace/db";

type DemoMemberSeed = {
  userId: string;
  name: string;
  stampsIssued: number;
  redemptions: number;
};

type DemoBusinessSeed = {
  key: string;
  name: string;
  category: string;
  location: string;
  description: string;
  programName: string;
  goal: number;
  rewardDescription: string;
  terms: string;
  members: DemoMemberSeed[];
  promotion: {
    title: string;
    description: string;
    multiplier: number;
    bonusStamps: number;
  } | null;
};

function transactionTimestamp(now: Date, index: number, total: number) {
  const daysAgo = (index * 17 + total * 3) % 50;
  return new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
}

export async function seedDemoWorkspace(
  ownerUserId: string,
  displayName: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerUserId}))`);

    const existing = await tx
      .select({ id: loyaltyBusinesses.id })
      .from(loyaltyBusinesses)
      .where(
        and(
          eq(loyaltyBusinesses.ownerUserId, ownerUserId),
          eq(loyaltyBusinesses.isDemo, true),
        ),
      )
      .limit(1);
    if (existing.length > 0) return false;

    const now = new Date();
    const coffee: DemoBusinessSeed = {
      key: "daybreak",
      name: "Daybreak Coffee",
      category: "Coffee shop",
      location: "Brooklyn, NY",
      description: "Small-batch coffee, familiar faces, and an easy reason to return.",
      programName: "Daybreak regulars",
      goal: 8,
      rewardDescription: "A coffee or tea, on us",
      terms: "One authorized stamp per visit. Rewards can be redeemed in store.",
      members: [
        {
          userId: ownerUserId,
          name: displayName,
          stampsIssued: 22,
          redemptions: 2,
        },
        {
          userId: "demo:daybreak:mina",
          name: "Mina Torres",
          stampsIssued: 17,
          redemptions: 1,
        },
        {
          userId: "demo:daybreak:eli",
          name: "Eli Brooks",
          stampsIssued: 16,
          redemptions: 2,
        },
        {
          userId: "demo:daybreak:noah",
          name: "Noah Reed",
          stampsIssued: 5,
          redemptions: 0,
        },
      ],
      promotion: {
        title: "Double stamps this month",
        description: "Earn two stamps on every approved visit through the end of the month.",
        multiplier: 2,
        bonusStamps: 0,
      },
    };
    const bakery: DemoBusinessSeed = {
      key: "lark",
      name: "Lark & Loaf",
      category: "Bakery",
      location: "Queens, NY",
      description: "Morning buns, slow-fermented loaves, and a neighborhood table.",
      programName: "The bread club",
      goal: 5,
      rewardDescription: "One pastry of your choice",
      terms: "One authorized stamp per visit. Rewards can be redeemed in store.",
      members: [
        {
          userId: "demo:lark:alex",
          name: "Alex Kim",
          stampsIssued: 13,
          redemptions: 2,
        },
        {
          userId: "demo:lark:jules",
          name: "Jules Rivera",
          stampsIssued: 7,
          redemptions: 1,
        },
        {
          userId: "demo:lark:casey",
          name: "Casey Morgan",
          stampsIssued: 3,
          redemptions: 0,
        },
      ],
      promotion: {
        title: "A little something extra",
        description: "Get one bonus stamp with an approved visit this week.",
        multiplier: 1,
        bonusStamps: 1,
      },
    };
    const barbershop: DemoBusinessSeed = {
      key: "northline",
      name: "Northline Barber Co.",
      category: "Barbershop",
      location: "Manhattan, NY",
      description: "Good cuts, good conversation, and a loyalty card that keeps up.",
      programName: "Northline regulars",
      goal: 6,
      rewardDescription: "$10 off a haircut",
      terms: "One authorized stamp per visit. Rewards can be redeemed in store.",
      members: [
        {
          userId: "demo:northline:drew",
          name: "Drew Lee",
          stampsIssued: 16,
          redemptions: 2,
        },
        {
          userId: "demo:northline:riley",
          name: "Riley Park",
          stampsIssued: 8,
          redemptions: 1,
        },
        {
          userId: "demo:northline:cam",
          name: "Cam Diaz",
          stampsIssued: 5,
          redemptions: 0,
        },
      ],
      promotion: null,
    };

    for (const sample of [coffee, bakery, barbershop]) {
      const businessId = randomUUID();
      await tx.insert(loyaltyBusinesses).values({
        id: businessId,
        ownerUserId,
        name: sample.name,
        category: sample.category,
        location: sample.location,
        description: sample.description,
        programName: sample.programName,
        goal: sample.goal,
        rewardDescription: sample.rewardDescription,
        terms: sample.terms,
        active: true,
        isDemo: true,
      });

      const promotionId = sample.promotion ? randomUUID() : null;
      if (sample.promotion) {
        await tx.insert(loyaltyCampaigns).values({
          id: promotionId!,
          businessId,
          type: "Promotion",
          title: sample.promotion.title,
          description: sample.promotion.description,
          active: true,
          startAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          endAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          multiplier: sample.promotion.multiplier,
          bonusStamps: sample.promotion.bonusStamps,
        });
      }

      await tx.insert(loyaltyCampaigns).values([
        {
          id: randomUUID(),
          businessId,
          type: "Reward",
          title: sample.rewardDescription,
          description: `Earn ${sample.goal} stamps to unlock this reward.`,
          active: true,
          multiplier: 1,
          bonusStamps: 0,
        },
        {
          id: randomUUID(),
          businessId,
          type: "Event",
          title: "Meet the neighborhood",
          description: "A demo event campaign. Owners can edit or pause it.",
          active: false,
          multiplier: 1,
          bonusStamps: 0,
        },
      ]);

      for (const memberSeed of sample.members) {
        const membershipId = randomUUID();
        const remaining = memberSeed.stampsIssued - memberSeed.redemptions * sample.goal;
        if (remaining < 0) {
          throw new Error(`Invalid sample balance for ${sample.name}`);
        }
        await tx.insert(loyaltyMemberships).values({
          id: membershipId,
          businessId,
          userId: memberSeed.userId,
          displayName: memberSeed.name,
          stampBalance: remaining,
          joinedAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
        });

        const transactions = [];
        for (let index = 0; index < memberSeed.stampsIssued; index += 1) {
          transactions.push({
            id: randomUUID(),
            businessId,
            membershipId,
            type: "stamp",
            stampDelta: 1,
            campaignId: null,
            idempotencyKey: `demo:${ownerUserId}:${sample.key}:${memberSeed.userId}:stamp:${index}`,
            description: "Sample approved stamp",
            isDemo: true,
            createdAt: transactionTimestamp(now, index, memberSeed.stampsIssued),
          });
        }
        for (let index = 0; index < memberSeed.redemptions; index += 1) {
          transactions.push({
            id: randomUUID(),
            businessId,
            membershipId,
            type: "redemption",
            stampDelta: -sample.goal,
            campaignId: null,
            idempotencyKey: `demo:${ownerUserId}:${sample.key}:${memberSeed.userId}:redemption:${index}`,
            description: sample.rewardDescription,
            isDemo: true,
            createdAt: new Date(
              now.getTime() - (memberSeed.redemptions - index) * 24 * 60 * 60 * 1000,
            ),
          });
        }
        if (transactions.length > 0) {
          await tx.insert(loyaltyTransactions).values(transactions);
        }
      }
    }

    return true;
  });
}
