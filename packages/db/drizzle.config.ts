import { defineConfig } from "drizzle-kit";

const url = new URL(process.env.DATABASE_URL ?? "postgres://localhost:5432/dcbot");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: "require",
  },
});