import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export async function withD1Config(callback) {
  const directory = await mkdtemp(join(tmpdir(), "paula-admin-"));
  const databaseName = process.env.ADMIN_D1_DATABASE_NAME || "site-creator-d1";
  const databaseId = process.env.ADMIN_D1_DATABASE_ID || "00000000-0000-4000-8000-000000000000";
  const configPath = join(directory, "wrangler.jsonc");
  await writeFile(configPath, JSON.stringify({
    name: "paula-admin-maintenance",
    main: join(process.cwd(), "worker/index.ts"),
    compatibility_date: "2026-07-27",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: [{
      binding: "DB",
      database_name: databaseName,
      database_id: databaseId,
      migrations_dir: join(process.cwd(), "drizzle"),
    }],
  }), { mode: 0o600 });

  try {
    return await callback({ directory, configPath, databaseName });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function runWrangler(argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["wrangler", ...argumentsList],
      { stdio: "inherit", env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" } },
    );
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`O Wrangler terminou com código ${code ?? "desconhecido"}.`)));
  });
}

export function targetFlags() {
  const remote = process.argv.includes("--remote");
  if (remote && !process.env.ADMIN_D1_DATABASE_ID) {
    throw new Error("Defina ADMIN_D1_DATABASE_ID antes de usar --remote.");
  }
  return remote ? ["--remote"] : ["--local", "--persist-to", ".wrangler/state"];
}
