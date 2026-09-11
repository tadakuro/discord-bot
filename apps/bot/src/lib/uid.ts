import { randomBytes } from "node:crypto";

export function uid(prefix = ""): string {
  return `${prefix}${randomBytes(8).toString("hex")}`;
}