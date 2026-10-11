import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, loyaltyBusinesses, staffPinCredentials, staffPinAttempts } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createBusiness, updateBusiness, createCampaign, joinBusiness } from "./service";
import { getLoyaltySnapshot } from "./snapshot";
import { requestCustomerStamp, redeemCustomerReward } from "./transactions";
import { currentStaffPin, PIN_LIFETIME_MS } from "./security";
import { seedDemoWorkspace } from "./demo";

// Development integration checks. Creates isolated records and deletes only
// those records at the end; never run against a production connection.
async function main() {
  assert.notEqual(process.env.NODE_ENV, "production");
  const owner = `test-owner-${randomUUID()}`;
  const customer = `test-customer-${randomUUID()}`;
  let businessId = "";
  try {
    const business = await createBusiness(owner, {
      name: "Integration test shop", category: "Test", location: "Test",
      description: "", programName: "Test card", goal: 2,
      rewardDescription: "Test reward", terms: "",
    });
    businessId = business.id;
    const issued = await currentStaffPin(businessId, owner);
    assert(issued && /^\d{4}$/.test(issued.pin), "Generated code must be exactly four digits");
    const pin = issued.pin;
    const otherPin = pin === "0000" ? "1111" : "0000";
    assert(Date.parse(issued.expiresAt) - Date.now() <= PIN_LIFETIME_MS);
    assert(Date.parse(issued.expiresAt) - Date.now() > PIN_LIFETIME_MS - 60_000);
    assert.equal(await currentStaffPin(businessId, customer), null);
    assert((await currentStaffPin(businessId, owner))?.pin === pin, "Code must persist between reads");
    await joinBusiness(customer, "Test customer", businessId);
    const [credential] = await db.select().from(staffPinCredentials).where(eq(staffPinCredentials.businessId, businessId));
    assert(credential.pinHash !== pin && !credential.encryptedPin?.includes(pin), "Code must not be stored in plaintext");
    assert.equal((await requestCustomerStamp(customer, businessId, "12345", randomUUID())).status, "invalid-pin");
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
    // Expire only the isolated test credential; no waiting three hours or changes to real businesses.
    await db.update(staffPinCredentials).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(staffPinCredentials.businessId, businessId));
    const rotated = await currentStaffPin(businessId, owner);
    assert(rotated && /^\d{4}$/.test(rotated.pin) && rotated.pin !== pin, "Rotation must generate a different four-digit code");
    assert.equal((await requestCustomerStamp(customer, businessId, rotated.pin, randomUUID())).status, "pin-locked");
    // Simulate the end of this test business's lockout.
    await db.delete(staffPinAttempts).where(eq(staffPinAttempts.businessId, businessId));
    assert.equal((await requestCustomerStamp(customer, businessId, pin, randomUUID())).status, "invalid-pin");
    assert.equal((await requestCustomerStamp(customer, businessId, rotated.pin, randomUUID())).status, "ok");
    assert.equal(await seedDemoWorkspace(owner, "Demo owner"), true);
    assert.equal(await seedDemoWorkspace(owner, "Demo owner"), false);
    assert.equal(await seedDemoWorkspace(customer, "Demo customer"), true);
    const ownerDemo = (await getLoyaltySnapshot(owner)).businesses.filter(row => row.isDemo);
    const customerDemo = (await getLoyaltySnapshot(customer)).businesses.filter(row => row.isDemo);
    assert.equal(ownerDemo.length, 3);
    assert.equal(customerDemo.length, 3);
    assert(ownerDemo.every(row => row.isOwner && !customerDemo.some(other => other.id === row.id)));
    assert.equal(await joinBusiness(customer, "Not allowed", ownerDemo[0].id), false);
    console.log("PASS: automatic four-digit codes, encrypted storage, owner-only disclosure, three-hour expiration, previous code rejection, lockout survives rotation, no duplicate demo seed, demo isolation, approvals, redemptions and balances.");
  } finally {
    await db.delete(loyaltyBusinesses).where(inArray(loyaltyBusinesses.ownerUserId, [owner, customer]));
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
