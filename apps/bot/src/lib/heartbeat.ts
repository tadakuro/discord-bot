export function startHeartbeat(intervalMs = 60_000): void {
  const url = process.env.HEARTBEAT_URL;
  if (!url) return;
  const ping = async () => {
    try {
      await fetch(url);
    } catch (err) {
      console.warn("[heartbeat] ping failed:", err);
    }
  };
  void ping();
  const timer = setInterval(() => void ping(), intervalMs);
  timer.unref?.();
  console.log("[heartbeat] monitoring enabled");
}