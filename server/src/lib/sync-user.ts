import { clerkClient } from "@clerk/express";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type ClerkRole = "ADMIN" | "USHER";
export type SyncStatus = "created" | "linked" | "updated";

export interface ClerkUserSyncInput {
  clerkId: string;
  email: string;
  name?: string | null;
  /** Declared role from Clerk public metadata (optional — matched by email otherwise). */
  role?: string | string[] | null;
}

export interface SyncResult {
  role: ClerkRole;
  kind: "admin" | "usher";
  status: SyncStatus;
  id: string;
}

export interface SyncOptions {
  /** Only link existing rows by clerkId/email; never create new rows. Used by the JIT middleware fallback. */
  linkOnly?: boolean;
}

interface ExistingLookup {
  adminByClerk: { id: string } | null;
  usherByClerk: { id: string } | null;
  adminByEmail: { id: string } | null;
  usherByEmail: { id: string } | null;
}

/**
 * Core Clerk → Neon sync, shared by the webhook (provision) and the auth
 * middleware fallback (linkOnly). Roles are decided by DB table membership:
 *  - explicit Clerk role (+ email match) wins,
 *  - otherwise an existing admins/ushers row with the same email is linked,
 *    (exact email first, plus-tag base like admin+clerk_test@… tolerated),
 *  - otherwise new rows default to USHER (first-ever user becomes ADMIN).
 */
export async function syncClerkUser(
  input: ClerkUserSyncInput,
  options: SyncOptions = {}
): Promise<SyncResult | null> {
  const email = input.email.trim().toLowerCase();
  const canonicalEmail = plusBaseEmail(email) ?? email;
  const clerkId = input.clerkId;

  const result = await prisma.$transaction(
    async (tx) => {
    const existing = await findExisting(tx, clerkId, email);

    const role = await resolveRole(tx, input.role, existing);

    if (role === "ADMIN") {
      if (existing.adminByClerk) {
        const updated = await tx.admin.update({
          where: { id: existing.adminByClerk.id },
          data: { name: displayName(input), email: canonicalEmail, clerkId },
        });
        return { role, kind: "admin", status: "updated", id: updated.id } as const;
      }
      if (existing.adminByEmail) {
        const linked = await tx.admin.update({
          where: { id: existing.adminByEmail.id },
          data: { clerkId, email: canonicalEmail, name: displayName(input) },
        });
        return { role, kind: "admin", status: "linked", id: linked.id } as const;
      }
      if (options.linkOnly) return null;
      const created = await tx.admin.create({ data: { clerkId, email: canonicalEmail, name: displayName(input) } });
      return { role, kind: "admin", status: "created", id: created.id } as const;
    }

    if (existing.usherByClerk) {
      const updated = await tx.usher.update({
        where: { id: existing.usherByClerk.id },
        data: { name: displayName(input), email: canonicalEmail, clerkId },
      });
      return { role, kind: "usher", status: "updated", id: updated.id } as const;
    }
    if (existing.usherByEmail) {
      const linked = await tx.usher.update({
        where: { id: existing.usherByEmail.id },
        data: { clerkId, name: displayName(input), email: canonicalEmail },
      });
      return { role, kind: "usher", status: "linked", id: linked.id } as const;
    }
    if (options.linkOnly) return null;

    // New usher: attach to the default (oldest) admin and enqueue at the tail.
    const defaultAdmin = await tx.admin.findFirst({ orderBy: { createdAt: "asc" } });
    if (!defaultAdmin) return null;
    const maxPos = await tx.rotationQueueEntry.findFirst({
      where: { adminId: defaultAdmin.id },
      orderBy: { position: "desc" },
    });
    const created = await tx.usher.create({
      data: { adminId: defaultAdmin.id, clerkId, email: canonicalEmail, name: displayName(input) },
    });
    await tx.rotationQueueEntry.create({
      data: { adminId: defaultAdmin.id, usherId: created.id, position: (maxPos?.position ?? 0) + 1 },
    });
    return { role, kind: "usher", status: "created", id: created.id } as const;
  },
    // Round-trips to Neon are slow; the Prisma default (5s) is too tight here.
    { timeout: 30_000, maxWait: 10_000 }
  );

  if (result) {
    await ensureClerkRole(clerkId, result.role);
  }
  return result;
}

/** Deletes the admin/usher row mapped to a deleted Clerk account. */
export async function removeClerkUser(
  clerkId: string
): Promise<{ kind: "admin" | "usher"; id: string } | null> {
  const admin = await prisma.admin.findUnique({ where: { clerkId } });
  if (admin) {
    await prisma.admin.delete({ where: { id: admin.id } });
    return { kind: "admin", id: admin.id };
  }
  const usher = await prisma.usher.findUnique({ where: { clerkId } });
  if (usher) {
    await prisma.usher.delete({ where: { id: usher.id } });
    return { kind: "usher", id: usher.id };
  }
  return null;
}

async function findExisting(
  tx: Prisma.TransactionClient,
  clerkId: string,
  email: string
): Promise<ExistingLookup> {
  // Sequential (not Promise.all): interactive transactions must not interleave
  // concurrent queries in Prisma 6.
  const adminByClerk = await tx.admin.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  const usherByClerk = await tx.usher.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  const byEmail = await findByEmail(tx, email);
  return { adminByClerk, usherByClerk, adminByEmail: byEmail.adminByEmail, usherByEmail: byEmail.usherByEmail };
}

/**
 * Locates the admin/usher rows owning `email`. An exact (case-insensitive)
 * match always wins. When it misses, a plus-tag alias is tolerated so Clerk
 * test accounts (admin+clerk_test@example.com) link back to the seeded base
 * record (admin@example.com) — but only if the row is not already claimed by a
 * real Clerk user (user_…) and only when exactly one candidate matches.
 */
async function findByEmail(
  tx: Prisma.TransactionClient,
  email: string
): Promise<{ adminByEmail: { id: string } | null; usherByEmail: { id: string } | null }> {
  const adminByEmail = await tx.admin.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  const usherByEmail = await tx.usher.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (adminByEmail || usherByEmail) return { adminByEmail, usherByEmail };

  const base = plusBaseEmail(email);
  if (!base) return { adminByEmail, usherByEmail };
  const unclaimed = [
    { clerkId: null },
    { clerkId: { not: { startsWith: "user_" } } },
  ];

  const admins = await tx.admin.findMany({
    where: { email: { equals: base, mode: "insensitive" }, OR: unclaimed },
    select: { id: true },
  });
  const ushers = await tx.usher.findMany({
    where: { email: { equals: base, mode: "insensitive" }, OR: unclaimed },
    select: { id: true },
  });
  return {
    adminByEmail: admins.length === 1 ? admins[0] : null,
    usherByEmail: ushers.length === 1 ? ushers[0] : null,
  };
}

/** "local+tag@domain" -> "local@domain"; null when the local part has no + tag. */
function plusBaseEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const plus = email.slice(0, at).indexOf("+");
  if (plus <= 0) return null;
  return `${email.slice(0, plus)}@${email.slice(at + 1)}`.toLowerCase();
}

async function resolveRole(
  tx: Prisma.TransactionClient,
  declared: string | string[] | null | undefined,
  existing: ExistingLookup
): Promise<ClerkRole> {
  const explicit = normalizeRole(declared);
  if (explicit) return explicit;
  if (existing.adminByClerk || existing.adminByEmail) return "ADMIN";
  if (existing.usherByClerk || existing.usherByEmail) return "USHER";
  const adminCount = await tx.admin.count();
  return adminCount === 0 ? "ADMIN" : "USHER";
}

function normalizeRole(raw: string | string[] | null | undefined): ClerkRole | null {
  if (Array.isArray(raw)) {
    return raw.includes("ADMIN") ? "ADMIN" : raw.includes("USHER") ? "USHER" : null;
  }
  return raw === "ADMIN" || raw === "USHER" ? raw : null;
}

function displayName(input: ClerkUserSyncInput): string {
  return input.name?.trim() || input.email.split("@")[0] || "Clerk user";
}

/** Best-effort write-back of the resolved role to Clerk public metadata. */
async function ensureClerkRole(clerkId: string, role: ClerkRole): Promise<void> {
  try {
    const user = await clerkClient.users.getUser(clerkId);
    const current = user.publicMetadata?.role;
    if (current === role) return;
    await clerkClient.users.updateUser(clerkId, {
      publicMetadata: { ...(user.publicMetadata as Record<string, unknown> | undefined), role },
    });
  } catch (err) {
    console.warn(
      "[warn] Could not write role %s to Clerk metadata for %s:",
      role,
      clerkId,
      (err as Error).message
    );
  }
}