import { sql } from "drizzle-orm";
import { getDb } from "./store.js";

let started = false;

export function startDbKeepAlive(intervalMs = 45_000): void {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      await getDb().execute(sql`select 1`);
    } catch (err) {
      console.warn("[db-keepalive] ping failed:", err instanceof Error ? err.message : err);
    }
  };
  void tick();
  setInterval(() => void tick(), intervalMs);
  console.log("[db-keepalive] database warm-up enabled");
}