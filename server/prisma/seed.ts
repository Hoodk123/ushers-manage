import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").trim().toLowerCase();
  const adminClerkId = process.env.SEED_ADMIN_CLERK_ID?.trim() || null;

  const admin = await prisma.admin.upsert({
    where: { email: adminEmail },
    update: { clerkId: adminClerkId },
    create: {
      clerkId: adminClerkId,
      name: "Lead Admin",
      email: adminEmail,
      phone: "+15550000111",
    },
  });

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

  const count = await prisma.usher.count();
  console.log(`Seed OK — admin "${admin.name}" + ${count} ushers`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());