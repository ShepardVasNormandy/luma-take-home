import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import path from "node:path";

config({ path: path.resolve(process.cwd(), "../../.env.local") });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
