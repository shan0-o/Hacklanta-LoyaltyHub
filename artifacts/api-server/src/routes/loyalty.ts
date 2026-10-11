import { getAuth } from "@clerk/express";
import type {
  BusinessInput,
  BusinessUpdate,
  CampaignInput,
  FavoriteInput,
  JoinBusinessInput,
  LoyaltySnapshot,
  StaffActionInput,
} from "@workspace/api-zod";
import { Router, type IRouter, type RequestHandler, type Response } from "express";
import { seedDemoWorkspace } from "../lib/loyalty/demo";
import {
  createBusiness,
  createCampaign,
  deleteCampaign,
  getSnapshotBusiness,
  joinBusiness,
  markNoticeRead,
  setFavorite,
  updateBusiness,
  updateCampaign,
} from "../lib/loyalty/service";
import { requestCustomerStamp, redeemCustomerReward } from "../lib/loyalty/transactions";
import { getLoyaltySnapshot } from "../lib/loyalty/snapshot";
import { currentStaffPin } from "../lib/loyalty/security";
import type { ActionOutcome } from "../lib/loyalty/transactions";

const router: IRouter = Router();

const requireSignedInUser: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to use loyalty features." });
    return;
  }
  res.locals.userId = userId;
  next();
};

router.use(requireSignedInUser);

function signedInUserId(res: Response) {
  return res.locals.userId as string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minLength &&
    value.length <= maxLength
  );
}

function pin(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{4}$/.test(value);
}

function validLogo(value: unknown): boolean {
  if (value === undefined || value === "") return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function parseBusinessInput(value: unknown): BusinessInput | null {
  if (!isRecord(value) || !validLogo(value.logoUrl)) return null;
  if (
    !text(value.name, 2, 80) ||
    !text(value.category, 2, 40) ||
    !text(value.location, 2, 120) ||
    typeof value.description !== "string" ||
    value.description.length > 500 ||
    !text(value.programName, 2, 80) ||
    !Number.isInteger(value.goal) ||
    (value.goal as number) < 2 ||
    (value.goal as number) > 30 ||
    !text(value.rewardDescription, 2, 180) ||
    typeof value.terms !== "string" ||
    value.terms.length > 1000 ||
    value.staffPin !== undefined
  ) {
    return null;
  }
  return {
    logoUrl: value.logoUrl as string | undefined,
    name: value.name,
    category: value.category,
    location: value.location,
    description: value.description,
    programName: value.programName,
    goal: value.goal as number,
    rewardDescription: value.rewardDescription,
    terms: value.terms,
  };
}

function parseBusinessUpdate(value: unknown): BusinessUpdate | null {
  if (!isRecord(value) || !validLogo(value.logoUrl)) return null;
  const parsed: BusinessUpdate = {};
  let fields = 0;
  if (value.logoUrl !== undefined) {
    parsed.logoUrl = value.logoUrl as string;
    fields++;
  }
  const stringRules = [
    ["name", 2, 80],
    ["category", 2, 40],
    ["location", 2, 120],
    ["description", 0, 500],
    ["programName", 2, 80],
    ["rewardDescription", 2, 180],
    ["terms", 0, 1000],
  ] as const;

  for (const [key, min, max] of stringRules) {
    if (value[key] === undefined) continue;
    if (!text(value[key], min, max)) return null;
    parsed[key] = value[key].trim();
    fields += 1;
  }
  if (value.goal !== undefined) {
    if (
      !Number.isInteger(value.goal) ||
      (value.goal as number) < 2 ||
      (value.goal as number) > 30
    ) {
      return null;
    }
    parsed.goal = value.goal as number;
    fields += 1;
  }
  if (value.active !== undefined) {
    if (typeof value.active !== "boolean") return null;
    parsed.active = value.active;
    fields += 1;
  }
  if (value.staffPin !== undefined) return null;
  return fields > 0 ? parsed : null;
}

const campaignTypes = new Set([
  "Promotion",
  "Reward",
  "Tier",
  "Event",
  "Giveaway",
]);

function validDateOrNull(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length <= 40 &&
      !Number.isNaN(Date.parse(value)))
  );
}

function parseCampaignInput(value: unknown): CampaignInput | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.type !== "string" ||
    !campaignTypes.has(value.type) ||
    !text(value.title, 2, 80) ||
    !text(value.description, 2, 500) ||
    typeof value.active !== "boolean" ||
    !validDateOrNull(value.startAt) ||
    !validDateOrNull(value.endAt) ||
    !Number.isInteger(value.multiplier) ||
    (value.multiplier as number) < 1 ||
    (value.multiplier as number) > 5 ||
    !Number.isInteger(value.bonusStamps) ||
    (value.bonusStamps as number) < 0 ||
    (value.bonusStamps as number) > 5 ||
    (value.startAt &&
      value.endAt &&
      Date.parse(value.endAt) <= Date.parse(value.startAt)) ||
    (value.type !== "Promotion" &&
      ((value.multiplier as number) !== 1 ||
        (value.bonusStamps as number) !== 0)) ||
    ((value.multiplier as number) > 1 &&
      (value.bonusStamps as number) > 0)
  ) {
    return null;
  }
  return {
    type: value.type as CampaignInput["type"],
    title: value.title,
    description: value.description,
    active: value.active,
    startAt: value.startAt,
    endAt: value.endAt,
    multiplier: value.multiplier as number,
    bonusStamps: value.bonusStamps as number,
  };
}

function parseJoinInput(value: unknown): JoinBusinessInput | null {
  if (!isRecord(value) || !text(value.displayName, 1, 80)) return null;
  return { displayName: value.displayName.trim() };
}

function parseFavoriteInput(value: unknown): FavoriteInput | null {
  if (!isRecord(value) || typeof value.favorite !== "boolean") return null;
  return { favorite: value.favorite };
}

function parseStaffActionInput(value: unknown): StaffActionInput | null {
  if (
    !isRecord(value) ||
    !pin(value.staffPin) ||
    !text(value.idempotencyKey, 8, 120)
  ) {
    return null;
  }
  return {
    staffPin: value.staffPin,
    idempotencyKey: value.idempotencyKey,
  };
}

function sendActionError(
  res: Response,
  outcome: ActionOutcome<unknown>,
) {
  if (outcome.status === "pin-locked") {
    res.setHeader("Retry-After", String(outcome.retryAfterSeconds));
    return res.status(423).json({
      error: `Too many incorrect PIN attempts. Try again in ${outcome.retryAfterSeconds} seconds.`,
    });
  }
  if (outcome.status === "invalid-pin") {
    return res.status(403).json({ error: "That staff PIN is incorrect." });
  }
  if (outcome.status === "pin-unconfigured") {
    return res.status(400).json({
      error: "The business owner must set a staff PIN before approving requests.",
    });
  }
  if (outcome.status === "not-member") {
    return res.status(404).json({ error: "Join this loyalty program first." });
  }
  if (outcome.status === "business-unavailable") {
    return res.status(404).json({ error: "This business is not available." });
  }
  if (outcome.status === "insufficient-stamps") {
    return res.status(409).json({ error: "There are not enough stamps to redeem." });
  }
  if (outcome.status === "idempotency-conflict") {
    return res.status(409).json({
      error: "This request key was already used for another loyalty action.",
    });
  }
  return res.status(500).json({ error: "The loyalty action could not be completed." });
}

router.get("/loyalty", async (_req, res) => {
  const snapshot: LoyaltySnapshot = await getLoyaltySnapshot(signedInUserId(res));
  res.json(snapshot);
});

router.get("/businesses/:businessId/staff-pin", async (req, res) => {
  res.set("Cache-Control", "no-store, private");
  const code = await currentStaffPin(req.params.businessId, signedInUserId(res));
  if (!code) { res.status(404).json({ error: "Business not found." }); return; }
  res.json(code);
});

router.post("/loyalty/demo-seed", async (req, res) => {
  if (
    !isRecord(req.body) ||
    !text(req.body.displayName, 1, 80)
  ) {
    res.status(400).json({ error: "A display name is required to seed demo data." });
    return;
  }
  const created = await seedDemoWorkspace(
    signedInUserId(res),
    req.body.displayName.trim(),
  );
  res.json({
    created,
    message: created
      ? "Three demo businesses and clearly marked sample history were created."
      : "This account already has a demo workspace.",
  });
});

router.post("/businesses", async (req, res) => {
  const input = parseBusinessInput(req.body);
  if (!input) {
    res.status(400).json({ error: "Check the business and program fields. Staff codes are generated automatically." });
    return;
  }
  const business = await createBusiness(signedInUserId(res), input);
  res.status(201).json(business);
});

router.patch("/businesses/:businessId", async (req, res) => {
  const input = parseBusinessUpdate(req.body);
  if (!input) {
    res.status(400).json({ error: "Add at least one valid business or program change." });
    return;
  }
  const business = await updateBusiness(
    signedInUserId(res),
    req.params.businessId,
    input,
  );
  if (!business) {
    res.status(404).json({ error: "Business not found." });
    return;
  }
  res.json(business);
});

router.post("/businesses/:businessId/memberships", async (req, res) => {
  const input = parseJoinInput(req.body);
  if (!input) {
    res.status(400).json({ error: "A valid display name is required." });
    return;
  }
  const joined = await joinBusiness(
    signedInUserId(res),
    input.displayName,
    req.params.businessId,
  );
  if (!joined) {
    res.status(404).json({ error: "This loyalty program is not available." });
    return;
  }
  const business = await getSnapshotBusiness(
    signedInUserId(res),
    req.params.businessId,
  );
  res.json(business);
});

router.patch("/businesses/:businessId/favorite", async (req, res) => {
  const input = parseFavoriteInput(req.body);
  if (!input) {
    res.status(400).json({ error: "Favorite must be true or false." });
    return;
  }
  const favorite = await setFavorite(
    signedInUserId(res),
    req.params.businessId,
    input.favorite,
  );
  if (!favorite) {
    res.status(404).json({ error: "Business not found." });
    return;
  }
  res.json(favorite);
});

router.post("/businesses/:businessId/stamps", async (req, res) => {
  const input = parseStaffActionInput(req.body);
  if (!input) {
    res.status(400).json({ error: "Enter a 4–8 digit staff PIN and retry this request." });
    return;
  }
  const outcome = await requestCustomerStamp(
    signedInUserId(res),
    req.params.businessId,
    input.staffPin,
    input.idempotencyKey,
  );
  if (
    (outcome.status === "ok" || outcome.status === "already-approved") &&
    outcome.result
  ) {
    res.json(outcome.result);
    return;
  }
  sendActionError(res, outcome);
});

router.post("/businesses/:businessId/redemptions", async (req, res) => {
  const input = parseStaffActionInput(req.body);
  if (!input) {
    res.status(400).json({ error: "Enter a 4–8 digit staff PIN and retry this request." });
    return;
  }
  const outcome = await redeemCustomerReward(
    signedInUserId(res),
    req.params.businessId,
    input.staffPin,
    input.idempotencyKey,
  );
  if (
    (outcome.status === "ok" || outcome.status === "already-approved") &&
    outcome.result
  ) {
    res.json(outcome.result);
    return;
  }
  sendActionError(res, outcome);
});

router.post("/businesses/:businessId/campaigns", async (req, res) => {
  const input = parseCampaignInput(req.body);
  if (!input) {
    res.status(400).json({
      error: "Check the campaign details, schedule, and promotion rules.",
    });
    return;
  }
  try {
    const campaign = await createCampaign(
      signedInUserId(res),
      req.params.businessId,
      input,
    );
    if (!campaign) {
      res.status(404).json({ error: "Business not found." });
      return;
    }
    res.status(201).json(campaign);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "The campaign dates or stamp rules are invalid.",
    });
  }
});

router.patch("/campaigns/:campaignId", async (req, res) => {
  const input = parseCampaignInput(req.body);
  if (!input) {
    res.status(400).json({
      error: "Check the campaign details, schedule, and promotion rules.",
    });
    return;
  }
  try {
    const campaign = await updateCampaign(
      signedInUserId(res),
      req.params.campaignId,
      input,
    );
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found." });
      return;
    }
    res.json(campaign);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "The campaign dates or stamp rules are invalid.",
    });
  }
});

router.delete("/campaigns/:campaignId", async (req, res) => {
  const deleted = await deleteCampaign(
    signedInUserId(res),
    req.params.campaignId,
  );
  if (!deleted) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }
  res.sendStatus(204);
});

router.patch("/notices/:noticeId", async (req, res) => {
  const updated = await markNoticeRead(
    signedInUserId(res),
    req.params.noticeId,
  );
  if (!updated) {
    res.status(404).json({ error: "Notice not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;
