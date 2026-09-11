import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const candidates = [resolve(__dirname, "../../.env"), resolve(__dirname, "../../.env.local"), resolve(__dirname, "../.env"), resolve(__dirname, ".env")];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
    return;
  }
}

function buildSql() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required");
  const url = new URL(raw);
  let ssl;
  const mode = url.searchParams.get("sslmode");
  if (mode) {
    url.searchParams.delete("sslmode");
    url.searchParams.delete("sslrootcert");
  }
  if (mode !== "disable") ssl = { rejectUnauthorized: false };
  return postgres(url.toString(), { max: 1, ...(ssl ? { ssl } : {}) });
}

const MIGRATE_TABLE = "__drizzle_migrations";

function unwrapDoBlock(stmt) {
  const m = stmt.match(/ALTER TABLE\s+[\s\S]*?FOREIGN KEY\s+[\s\S]*?;\s*(?=EXCEPTION|$)/);
  return m ? m[0] : null;
}

async function main() {
  loadEnv();
  const sql = buildSql();
  const meta = JSON.parse(readFileSync(resolve(__dirname, "drizzle/meta/_journal.json"), "utf8"));

  await sql.unsafe(`CREATE TABLE IF NOT EXISTS ${MIGRATE_TABLE} (name text PRIMARY KEY, executed_at timestamp DEFAULT now())`);
  const appliedRows = await sql.unsafe(`SELECT name FROM ${MIGRATE_TABLE}`);
  const applied = new Set(appliedRows.map((r) => r.name));

  let ran = 0;
  for (const entry of meta.entries) {
    const tag = entry.tag;
    if (applied.has(tag)) {
      console.log(`skip ${tag} (already applied)`);
      continue;
    }
    const body = readFileSync(resolve(__dirname, "drizzle", `${tag}.sql`), "utf8");
    const statements = body.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      let toRun = stmt;
      if (/^DO\s+\$\$/.test(stmt)) {
        const unwrapped = unwrapDoBlock(stmt);
        if (unwrapped) {
          console.log(`  (unwrapped DO block -> ${unwrapped.slice(0, 72)}...)`);
          toRun = unwrapped;
        }
      }
      console.log(`  ${toRun.slice(0, 72)}`);
      await sql.unsafe(toRun);
    }
    await sql.unsafe(`INSERT INTO ${MIGRATE_TABLE} (name) VALUES ($1)`, [tag]);
    console.log(`applied ${tag}`);
    ran++;
  }
  await sql.end();
  console.log(ran ? `done, ${ran} migration(s) applied` : "nothing to run");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});