import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireConfig } from "../config.js";
import * as schema from "./schema.js";

let instance: ReturnType<typeof create> | undefined;

function create() {
  const client = postgres(requireConfig("DATABASE_URL"), { max: 10 });
  return drizzle(client, { schema });
}

export function db() {
  instance ??= create();
  return instance;
}
