import { randomUUID, scrypt as nodeScrypt } from "node:crypto";
import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { withD1Config, runWrangler, targetFlags } from "./d1-command.mjs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const commonPasswords = new Set(["1234567890", "password123", "qwerty12345", "administrador", "adminadmin", "paulapeixoto"]);
const rl = createInterface({ input: stdin, output: stdout });

try {
  const email = (process.env.ADMIN_EMAIL || await rl.question("Email do owner: ")).trim().toLowerCase();
  const displayName = (process.env.ADMIN_DISPLAY_NAME || await rl.question("Nome a apresentar: ")).trim();
  rl.close();
  if (!emailPattern.test(email) || email.length > 254) throw new Error("O email não é válido.");
  if (!displayName || displayName.length > 120) throw new Error("O nome não é válido.");

  const password = process.env.ADMIN_PASSWORD || await hiddenQuestion("Password (mínimo 10 caracteres): ");
  const confirmation = process.env.ADMIN_PASSWORD
    ? process.env.ADMIN_PASSWORD
    : await hiddenQuestion("Confirmar password: ");
  if (password !== confirmation) throw new Error("As passwords não coincidem.");
  if (password.length < 10 || password.length > 256 || commonPasswords.has(password.toLowerCase())) {
    throw new Error("Escolha uma password segura com pelo menos 10 caracteres.");
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const sql = `INSERT INTO admin_users (
    id, email, password_hash, display_name, role, is_active, must_change_password, created_at, updated_at
  ) VALUES (
    '${sqlValue(randomUUID())}', '${sqlValue(email)}', '${sqlValue(passwordHash)}',
    '${sqlValue(displayName)}', 'owner', 1, 0, '${sqlValue(now)}', '${sqlValue(now)}'
  );\n`;

  await withD1Config(async ({ directory, configPath, databaseName }) => {
    const sqlPath = `${directory}/create-owner.sql`;
    await writeFile(sqlPath, sql, { mode: 0o600 });
    await runWrangler([
      "d1", "execute", databaseName,
      "--config", configPath,
      "--file", sqlPath,
      ...targetFlags(),
    ]);
  });
  stdout.write(`Owner criado para ${email}. A password não foi guardada nem mostrada.\n`);
} catch (error) {
  rl.close();
  const message = error instanceof Error ? error.message : "Não foi possível criar o owner.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function hiddenQuestion(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Sem terminal interativo: forneça ADMIN_PASSWORD apenas durante esta execução.");
  }
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (character) => {
      if (character === "\u0003") {
        cleanup();
        reject(new Error("Operação cancelada."));
      } else if (character === "\r" || character === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) return reject(error);
      resolve(`scrypt$32768$8$1$${Buffer.from(salt).toString("base64url")}$${key.toString("base64url")}`);
    });
  });
}

function sqlValue(value) {
  return value.replaceAll("'", "''");
}
