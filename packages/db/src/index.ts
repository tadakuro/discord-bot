import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DbClient = PostgresJsDatabase<typeof schema>;

type Normalized = { url: string; ssl?: { rejectUnauthorized: boolean } };

function normalizeUrl(raw: string): Normalized {
  const url = new URL(raw);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) {
    url.searchParams.delete("sslmode");
    url.searchParams.delete("sslrootcert");
  }
  if (sslMode !== "disable") {
    return { url: url.toString(), ssl: { rejectUnauthorized: false } };
  }
  return { url: url.toString() };
}

export function createDb(connectionString?: string): DbClient {
  const raw = connectionString ?? process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is required to create a database client");
  }
  const { url, ssl } = normalizeUrl(raw);
  const sql = postgres(url, { max: 1, connect_timeout: 45, ...(ssl ? { ssl } : {}) });
  return drizzle(sql, { schema });
}

export { schema };
export * from "./schema";
export * from "./levels";