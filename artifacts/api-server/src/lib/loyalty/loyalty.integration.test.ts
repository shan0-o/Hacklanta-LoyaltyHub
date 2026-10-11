import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, loyaltyBusinesses, staffPinCredentials } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createBusiness, updateBusiness, createCampaign, joinBusiness } from "./service";
import { getLoyaltySnapshot } from "./snapshot";
import { requestCustomerStamp, redeemCustomerReward } from "./transactions";

// Development integration checks. Creates isolated records and deletes only
// those records at the end; never run against a production connection.
async function main() {
  assert.notEqual(process.env.NODE_ENV, "production");
  const owner = `test-owner-${randomUUID()}`;
  const customer = `test-customer-${randomUUID()}`;
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const otherPin = pin === "000000" ? "111111" : "000000";
  let businessId = "";
  try {
    const business = await createBusiness(owner, {
      name: "Integration test shop", category: "Test", location: "Test",
      description: "", programName: "Test card", goal: 2,
      rewardDescription: "Test reward", terms: "", staffPin: pin,
    });
    businessId = business.id;
    await joinBusiness(customer, "Test customer", businessId);
    const [credential] = await db.select().from(staffPinCredentials).where(eq(staffPinCredentials.businessId, businessId));
    assert.notEqual(credential.pinHash, pin);
    assert.equal(await updateBusiness(customer, businessId, { name: "Unauthorized" }), null);
    assert.equal((await requestCustomerStamp(owner, businessId, pin, randomUUID())).status, "not-member");
    assert.equal((await redeemCustomerReward(customer, businessId, pin, randomUUID())).status, "insufficient-stamps");
    assert.equal((await requestCustomerStamp(customer, businessId, otherPin, randomUUID())).status, "invalid-pin");
    await createCampaign(owner, businessId, {
      type: "Promotion", title: "Double test", description: "Two stamps",
      active: true, startAt: null, endAt: null, multiplier: 2, bonusStamps: 0,
    });
    const key = randomUUID();
    const awards = await Promise.all([
      requestCustomerStamp(customer, businessId, pin, key),
      requestCustomerStamp(customer, businessId, pin, key),
    ]);
    assert(awards.some(result => result.status === "ok"));
    assert(awards.some(result => result.status === "already-approved"));
    const customerSnapshot = await getLoyaltySnapshot(customer);
    const card = customerSnapshot.businesses.find(row => row.id === businessId)!;
    assert.equal(card.members[0].stamps, 2);
    assert.equal(card.analytics, null);
    assert.equal(card.history?.length, 1);
    assert(customerSnapshot.notices.some(row => row.businessId === businessId));
    const redemptionKey = randomUUID();
    const redemptions = await Promise.all([
      redeemCustomerReward(customer, businessId, pin, redemptionKey),
      redeemCustomerReward(customer, businessId, pin, redemptionKey),
    ]);
    assert(redemptions.some(result => result.status === "ok"));
    assert(redemptions.some(result => result.status === "already-approved"));
    assert.equal((await redeemCustomerReward(customer, businessId, pin, randomUUID())).status, "insufficient-stamps");
    const stats = (await getLoyaltySnapshot(owner)).businesses.find(row => row.id === businessId)!.analytics!;
    assert.equal(stats.stamps, 2);
    assert.equal(stats.redemptions, 1);
    assert.equal(stats.approvedVisits, 1);
    await createCampaign(owner, businessId, {
      type: "Promotion", title: "Bonus test", description: "Extra stamp",
      active: true, startAt: null, endAt: null, multiplier: 1, bonusStamps: 1,
    });
    const bonus = await requestCustomerStamp(customer, businessId, pin, randomUUID());
    assert.equal(bonus.status, "ok");
    if ("result" in bonus) assert.equal(bonus.result?.awardedStamps, 2); // no stacking
    await updateBusiness(owner, businessId, { goal: 5, active: false });
    const paused = (await getLoyaltySnapshot(customer)).businesses.find(row => row.id === businessId)!;
    assert.equal(paused.members[0].stamps, 2);
    assert.equal(paused.active, false);
    assert.equal((await requestCustomerStamp(customer, businessId, pin, randomUUID())).status, "business-unavailable");
    await updateBusiness(owner, businessId, { active: true });
    for (let i = 0; i < 4; i++) {
      assert.equal((await requestCustomerStamp(customer, businessId, otherPin, randomUUID())).status, "invalid-pin");
    }
    assert.equal((await requestCustomerStamp(customer, businessId, otherPin, randomUUID())).status, "pin-locked");
    assert.equal((await requestCustomerStamp(customer, businessId, pin, randomUUID())).status, "pin-locked");
    await updateBusiness(owner, businessId, { staffPin: pin });
    assert.equal((await requestCustomerStamp(customer, businessId, pin, randomUUID())).status, "ok");
    console.log("PASS: ownership, hashing, invalid PIN, insufficient balance, double stamps, concurrent duplicate awards/redemptions, notices, history, analytics, bonus/no stacking, preserved progress, paused wallet, lockout and owner reset.");
  } finally {
    if (businessId) await db.delete(loyaltyBusinesses).where(eq(loyaltyBusinesses.id, businessId));
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
