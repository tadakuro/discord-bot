export * from "./schema";

export const DEFAULT_LOG_EVENTS = [
  "messageDelete",
  "messageEdit",
  "memberJoin",
  "memberLeave",
  "memberUpdate",
] as const;

export const LEVEL_XP_BASE = 100;
export const LEVEL_XP_MULTIPLIER = 50;

export function xpRequiredForLevel(level: number): number {
  return LEVEL_XP_BASE + (level - 1) * LEVEL_XP_MULTIPLIER;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level);
    level++;
  }
  return level;
}