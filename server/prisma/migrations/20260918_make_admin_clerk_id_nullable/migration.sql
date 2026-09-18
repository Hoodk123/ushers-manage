-- Allow an admin row to exist before its Clerk account is linked (JIT link by email).
ALTER TABLE "admins" ALTER COLUMN "clerkId" DROP NOT NULL;