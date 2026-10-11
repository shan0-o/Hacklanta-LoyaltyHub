import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  staffPinAttempts,
  staffPinCredentials,
} from "@workspace/db";

const PIN_BYTES = 64;
const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

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
