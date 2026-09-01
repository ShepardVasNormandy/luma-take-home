import * as argon2 from "argon2";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const raw = process.argv[2] ?? (await readStdin());
const password = raw.replace(/\r?\n$/, "");

if (!password) {
  process.stderr.write("Usage: pnpm hash-password <password>  (or pipe the password via stdin)\n");
  process.exit(1);
}

const hash = await argon2.hash(password, { type: argon2.argon2id });
process.stdout.write(`${hash}\n`);
