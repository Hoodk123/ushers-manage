import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { hashPassword } from "../src/lib/security.js";

const prisma = new PrismaClient();

async function main() {
  // Default to admin@example.com when SEED_ADMIN_EMAIL is empty/unset.
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com")
    .trim()
    .toLowerCase()
    // .env.example ships with "" so it reads "use the default".
    || "admin@example.com";

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD must be set in server/.env to seed the admin account"
    );
  }

  const admin = await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Lead Admin",
      email: adminEmail,
      phone: "+15550000111",
    },
  });

  const passwordHash = await hashPassword(adminPassword);
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash },
    create: {
      name: "Lead Admin",
      email: adminEmail,
      passwordHash,
    },
  });

  // Link the account to the admin profile unless an account already owns it.
  if (admin.userId && admin.userId !== adminUser.id) {
    console.warn(
      `[warn] admin profile ${adminEmail} is already linked to another account — not re-linking`
    );
  } else if (!admin.userId) {
    await prisma.admin.update({ where: { id: admin.id }, data: { userId: adminUser.id } });
  }

  const names = [
    ["James Mwangi", "James.Mwangi@example.com"],
    ["Grace Wanjiru", "Grace.Wanjiru@example.com"],
    ["Peter Otieno", "Peter.Otieno@example.com"],
    ["Mercy Achieng", "Mercy.Achieng@example.com"],
  ];

  for (const [i, [name, email]] of names.entries()) {
    await prisma.usher.upsert({
      where: { email },
      update: {},
      create: {
        name,
        email,
        phone: `+15550000${100 + i}`,
        adminId: admin.id,
        queueEntry: {
          create: { adminId: admin.id, position: i + 1 },
        },
      },
    });
  }

  const usherCount = await prisma.usher.count();
  console.log(
    `Seed OK — admin "${admin.name}" (${adminEmail}) + ${usherCount} ushers`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());