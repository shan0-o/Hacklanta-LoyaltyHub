import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
  randomInt, createCipheriv, createDecipheriv, createHash,
} from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  staffPinAttempts,
  staffPinCredentials,
  loyaltyBusinesses,
} from "@workspace/db";

const PIN_BYTES = 64;
const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
export const PIN_LIFETIME_MS = 3 * 60 * 60 * 1000;
const PIN_WARNING = "Do not share this code with customers or anyone else. Authorized staff should enter it discreetly.";

function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Staff PIN encryption is not configured.");
  return createHash("sha256").update(`loyaltyhub-staff-pin:${secret}`).digest();
}

function encryptPin(pin: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64")).join(".");
}

function decryptPin(value: string) {
  const [iv, tag, data] = value.split(".").map(part => Buffer.from(part, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}

// Rotation is evaluated on every approval and owner read, including after
// server restarts. No scheduler is needed and an expired code is never accepted.
export async function currentStaffPin(businessId: string, ownerUserId?: string) {
  return db.transaction(async tx => {
    const [business] = await tx.select().from(loyaltyBusinesses)
      .where(eq(loyaltyBusinesses.id, businessId)).for("update").limit(1);
    if (!business || (ownerUserId !== undefined && business.ownerUserId !== ownerUserId)) return null;
    const [credential] = await tx.select().from(staffPinCredentials)
      .where(eq(staffPinCredentials.businessId, businessId)).limit(1);
    const now = new Date();
    if (credential?.encryptedPin && credential.expiresAt && credential.expiresAt > now) {
      return { pin: decryptPin(credential.encryptedPin), expiresAt: credential.expiresAt.toISOString(), warning: PIN_WARNING };
    }
    const previous = credential?.encryptedPin ? decryptPin(credential.encryptedPin) : null;
    let pin: string;
    do { pin = String(randomInt(0, 10_000)).padStart(4, "0"); } while (pin === previous);
    const expiresAt = new Date(now.getTime() + PIN_LIFETIME_MS);
    const values = { ...await hashStaffPin(pin), encryptedPin: encryptPin(pin), expiresAt, updatedAt: now };
    await tx.insert(staffPinCredentials).values({ businessId, ...values })
      .onConflictDoUpdate({ target: staffPinCredentials.businessId, set: values });
    // Keep failed-attempt lockouts across rotations.
    return { pin, expiresAt: expiresAt.toISOString(), warning: PIN_WARNING };
  });
}

async function derivePinHash(pin: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      pin,
      salt,
      PIN_BYTES,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      },
    );
  });
}

export async function hashStaffPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const pinHash = (await derivePinHash(pin, salt)).toString("hex");
  return { salt, pinHash };
}

export type PinVerification =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "locked"; retryAfterSeconds: number }
  | { status: "unconfigured" };

export async function verifyStaffPin(
  businessId: string,
  pin: string,
): Promise<PinVerification> {
  if (!/^\d{4}$/.test(pin)) return { status: "invalid" };
  if (!await currentStaffPin(businessId)) return { status: "unconfigured" };
  const [credential] = await db
    .select()
    .from(staffPinCredentials)
    .where(eq(staffPinCredentials.businessId, businessId))
    .limit(1);

  if (!credential) return { status: "unconfigured" };

  return db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .insert(staffPinAttempts)
      .values({ businessId })
      .onConflictDoNothing();

    const [attempt] = await tx
      .select()
      .from(staffPinAttempts)
      .where(eq(staffPinAttempts.businessId, businessId))
      .for("update")
      .limit(1);

    if (attempt?.lockedUntil && attempt.lockedUntil.getTime() > now.getTime()) {
      return {
        status: "locked" as const,
        retryAfterSeconds: Math.ceil(
          (attempt.lockedUntil.getTime() - now.getTime()) / 1000,
        ),
      };
    }

    const expiredWindow =
      !attempt ||
      now.getTime() - attempt.windowStartedAt.getTime() > FAILURE_WINDOW_MS;
    const priorFailures = expiredWindow ? 0 : attempt.failureCount;
    const hash = await derivePinHash(pin, credential.salt);
    const storedHash = Buffer.from(credential.pinHash, "hex");
    const isValid =
      !!credential.expiresAt && credential.expiresAt > new Date() &&
      hash.length === storedHash.length && timingSafeEqual(hash, storedHash);

    if (!isValid) {
      const nextFailures = priorFailures + 1;
      const locked = nextFailures >= FAILURE_LIMIT;
      await tx
        .update(staffPinAttempts)
        .set({
          failureCount: locked ? 0 : nextFailures,
          windowStartedAt: expiredWindow ? now : attempt.windowStartedAt,
          lockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MS) : null,
          updatedAt: now,
        })
        .where(eq(staffPinAttempts.businessId, businessId));
      return locked
        ? {
            status: "locked" as const,
            retryAfterSeconds: Math.ceil(LOCKOUT_MS / 1000),
          }
        : { status: "invalid" as const };
    }

    await tx
      .update(staffPinAttempts)
      .set({
        failureCount: 0,
        windowStartedAt: now,
        lockedUntil: null,
        updatedAt: now,
      })
      .where(eq(staffPinAttempts.businessId, businessId));
    return { status: "ok" as const };
  });
}
