import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const loyaltyBusinesses = pgTable(
  "loyalty_businesses",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    location: text("location").notNull(),
    description: text("description").notNull().default(""),
    programName: text("program_name").notNull(),
    goal: integer("goal").notNull().default(8),
    rewardDescription: text("reward_description").notNull(),
    terms: text("terms").notNull().default(""),
    active: boolean("active").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("loyalty_businesses_owner_idx").on(table.ownerUserId),
    index("loyalty_businesses_active_idx").on(table.active),
  ],
);

export const staffPinCredentials = pgTable("staff_pin_credentials", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => loyaltyBusinesses.id, { onDelete: "cascade" }),
  salt: text("salt").notNull(),
  pinHash: text("pin_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const loyaltyMemberships = pgTable(
  "loyalty_memberships",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => loyaltyBusinesses.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    stampBalance: integer("stamp_balance").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("loyalty_memberships_business_user_unique").on(
      table.businessId,
      table.userId,
    ),
    index("loyalty_memberships_business_idx").on(table.businessId),
  ],
);

export const loyaltyCampaigns = pgTable(
  "loyalty_campaigns",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => loyaltyBusinesses.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    active: boolean("active").notNull().default(true),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    multiplier: integer("multiplier").notNull().default(1),
    bonusStamps: integer("bonus_stamps").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("loyalty_campaigns_business_idx").on(table.businessId),
    index("loyalty_campaigns_schedule_idx").on(
      table.businessId,
      table.active,
      table.startAt,
      table.endAt,
    ),
    check(
      "loyalty_campaigns_type_check",
      sql`${table.type} in ('Promotion', 'Reward', 'Tier', 'Event', 'Giveaway')`,
    ),
    check("loyalty_campaigns_multiplier_check", sql`${table.multiplier} between 1 and 5`),
    check("loyalty_campaigns_bonus_check", sql`${table.bonusStamps} between 0 and 5`),
  ],
);

export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => loyaltyBusinesses.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => loyaltyMemberships.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    stampDelta: integer("stamp_delta").notNull(),
    campaignId: text("campaign_id").references(() => loyaltyCampaigns.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    description: text("description").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("loyalty_transactions_idempotency_unique").on(
      table.idempotencyKey,
    ),
    index("loyalty_transactions_business_created_idx").on(
      table.businessId,
      table.createdAt,
    ),
    index("loyalty_transactions_membership_idx").on(
      table.membershipId,
      table.createdAt,
    ),
    check(
      "loyalty_transactions_type_delta_check",
      sql`(${table.type} = 'stamp' and ${table.stampDelta} > 0) or (${table.type} = 'redemption' and ${table.stampDelta} < 0)`,
    ),
  ],
);

export const staffPinAttempts = pgTable(
  "staff_pin_attempts",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => loyaltyBusinesses.id, { onDelete: "cascade" }),
    failureCount: integer("failure_count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.businessId] }),
    index("staff_pin_attempts_locked_idx").on(table.lockedUntil),
  ],
);

export const loyaltyFavorites = pgTable(
  "loyalty_favorites",
  {
    userId: text("user_id").notNull(),
    businessId: text("business_id")
      .notNull()
      .references(() => loyaltyBusinesses.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.businessId] }),
    index("loyalty_favorites_business_idx").on(table.businessId),
  ],
);

export const loyaltyNotices = pgTable(
  "loyalty_notices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    businessId: text("business_id")
      .notNull()
      .references(() => loyaltyBusinesses.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("loyalty_notices_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);
