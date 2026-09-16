import { config as loadEnv } from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "..", ".env") });

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("FAIL: DATABASE_URL is not set in server/.env");
  process.exit(1);
}

let host = "(unknown)";
let database = "(unknown)";
let port = "";
try {
  const url = new URL(raw);
  host = url.hostname;
  database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  port = url.port ? `:${url.port}` : "";
} catch {
  console.error("FAIL: DATABASE_URL is not a valid URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: raw });
try {
  await client.connect();
  const res = await client.query("select current_database() as db, current_user as role, version();");
  const row = res.rows[0];
  console.log(`OK: connected to database "${row.db}" as "${row.role}"`);
  console.log(`HOST: ${host}${port}`);
  console.log(`PG: ${(row.version || "").split(" ")[1] ?? "unknown"}`);
  await client.end();
  process.exit(0);
} catch (err) {
  console.error(`FAIL: could not connect to ${database} at ${host}${port}`);
  if (err instanceof Error) console.error(`REASON: ${err.message}`);
  process.exit(1);
}