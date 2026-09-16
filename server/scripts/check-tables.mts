import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();
const tables = await prisma.$queryRawUnsafe(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name"
);
console.log("TABLES:", (tables as { table_name: string }[]).map((r) => r.table_name).join(", "));
const adminCount = await prisma.admin.count();
const usherCount = await prisma.usher.count();
console.log(`COUNTS: admins=${adminCount} ushers=${usherCount}`);
await prisma.$disconnect();