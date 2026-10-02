import { Algorithm, hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** OWASP 2023-recommended Argon2id parameters for interactive logins. */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 7);
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Random 32-byte session token, base64url-encoded (stateless on its own). */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the SHA-256 digest of a session token is ever persisted. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}