import { scrypt as nodeScrypt } from "node:crypto";
import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { withD1Config, runWrangler, targetFlags } from "./d1-command.mjs";

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Defina ADMIN_EMAIL com o email exato da conta.");
}
if (password.length < 10 || password.length > 256) {
  throw new Error("Defina temporariamente ADMIN_PASSWORD com pelo menos 10 caracteres.");
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await new Promise((resolve, reject) => {
  nodeScrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => {
    if (error) reject(error);
    else resolve(result);
  });
});
const hash = `scrypt$32768$8$1$${Buffer.from(salt).toString("base64url")}$${key.toString("base64url")}`;
const now = new Date().toISOString();
const safeEmail = email.replaceAll("'", "''");
const sql = `UPDATE admin_users
SET password_hash = '${hash}', must_change_password = 1, updated_at = '${now}'
WHERE email = '${safeEmail}';
UPDATE admin_sessions SET revoked_at = '${now}'
WHERE user_id = (SELECT id FROM admin_users WHERE email = '${safeEmail}') AND revoked_at IS NULL;\n`;

await withD1Config(async ({ directory, configPath, databaseName }) => {
  const sqlPath = `${directory}/reset-owner.sql`;
  await writeFile(sqlPath, sql, { mode: 0o600 });
  await runWrangler([
    "d1", "execute", databaseName,
    "--config", configPath,
    "--file", sqlPath,
    ...targetFlags(),
  ]);
});
process.stdout.write("Password substituída e sessões revogadas. A conta terá de alterar a password no próximo login.\n");
