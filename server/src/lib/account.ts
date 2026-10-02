import type { Prisma, PrismaClient } from "@prisma/client";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "local+tag@domain" -> "local@domain"; null when the local part has no + tag. */
export function plusBaseEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const plus = email.slice(0, at).indexOf("+");
  if (plus <= 0) return null;
  return `${email.slice(0, plus)}@${email.slice(at + 1)}`.toLowerCase();
}

export interface LinkedProfiles {
  adminId: string | null;
  usherId: string | null;
}

type Db = PrismaClient | Prisma.TransactionClient;

interface ProfileHit {
  id: string;
  userId: string | null;
}

interface ProfileLookupResult {
  admin: ProfileHit | null;
  usher: ProfileHit | null;
}

/**
 * Locates the admins/ushers rows owning `email`. An exact (case-insensitive)
 * match wins. When it misses, a plus-tag alias is tolerated so addresses like
 * admin+test@example.com resolve back to the seeded base record — but only
 * when exactly one unclaimed candidate matches.
 */
async function findProfilesByEmail(client: Db, email: string): Promise<ProfileLookupResult> {
  const admin = await client.admin.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, userId: true },
  });
  const usher = await client.usher.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, userId: true },
  });
  if (admin || usher) return { admin, usher };

  const base = plusBaseEmail(email);
  if (!base) return { admin: null, usher: null };

  const admins = await client.admin.findMany({
    where: { email: { equals: base, mode: "insensitive" }, userId: null },
    select: { id: true, userId: true },
  });
  const ushers = await client.usher.findMany({
    where: { email: { equals: base, mode: "insensitive" }, userId: null },
    select: { id: true, userId: true },
  });
  return {
    admin: admins.length === 1 ? admins[0] : null,
    usher: ushers.length === 1 ? ushers[0] : null,
  };
}

/**
 * Links an account to existing admin/usher rows by email. Idempotent: an
 * already-linked profile is left alone, and one owned by a different account
 * is never taken over.
 */
export async function linkProfilesToUser(
  client: Db,
  userId: string,
  email: string
): Promise<LinkedProfiles> {
  const found = await findProfilesByEmail(client, email);

  let adminId: string | null = null;
  if (found.admin && (found.admin.userId === null || found.admin.userId === userId)) {
    const admin = await client.admin.update({
      where: { id: found.admin.id },
      data: { userId },
    });
    adminId = admin.id;
  }

  let usherId: string | null = null;
  if (found.usher && (found.usher.userId === null || found.usher.userId === userId)) {
    const usher = await client.usher.update({
      where: { id: found.usher.id },
      data: { userId },
    });
    usherId = usher.id;
  }

  return { adminId, usherId };
}

/**
 * Creates an usher row for an account that matches no existing profile, under
 * the default (oldest) admin, enqueued at the tail of the rotation. When no
 * admin exists yet, the account is bootstrapped as an admin instead and no
 * usher is created.
 */
export async function provisionUsherForUser(
  client: Db,
  userId: string,
  name: string,
  email: string
): Promise<{ kind: "admin" | "usher"; id: string } | null> {
  const defaultAdmin = await client.admin.findFirst({ orderBy: { createdAt: "asc" } });

  if (!defaultAdmin) {
    const admin = await client.admin.create({ data: { name, email, userId } });
    return { kind: "admin", id: admin.id };
  }

  const maxPos = await client.rotationQueueEntry.findFirst({
    where: { adminId: defaultAdmin.id },
    orderBy: { position: "desc" },
  });

  const usher = await client.usher.create({
    data: { adminId: defaultAdmin.id, userId, name, email },
  });
  await client.rotationQueueEntry.create({
    data: {
      adminId: defaultAdmin.id,
      usherId: usher.id,
      position: (maxPos?.position ?? 0) + 1,
    },
  });
  return { kind: "usher", id: usher.id };
}