import { Buffer } from "node:buffer";
import { scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;
const FORMAT = "scrypt";

export const DUMMY_PASSWORD_HASH =
  "scrypt$32768$8$1$CT9qYJOL-DC8nRYSfdHe9Q$AZzQN3HynT00T1Q9d5qINMPaxmZAa0utCLD_O5qtuMf1xeL36k2q6ror0iU8TMeNp_z2iqm_9CeTujBIe-w3Lw";

function deriveKey(
  password: string,
  salt: Uint8Array,
  length: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      length,
      { ...options, maxmem: MAX_MEMORY },
      (error, key) => error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const validationError = validatePassword(password);
  if (validationError) throw new Error(validationError);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    FORMAT,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    Buffer.from(salt).toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    const [format, rawN, rawR, rawP, rawSalt, rawKey] = encodedHash.split("$");
    if (format !== FORMAT || !rawN || !rawR || !rawP || !rawSalt || !rawKey) return false;

    const options = { N: Number(rawN), r: Number(rawR), p: Number(rawP) };
    if (
      !Number.isSafeInteger(options.N) ||
      !Number.isSafeInteger(options.r) ||
      !Number.isSafeInteger(options.p) ||
      options.N < 16_384 ||
      options.N > 131_072 ||
      options.r < 1 ||
      options.r > 16 ||
      options.p < 1 ||
      options.p > 4
    ) return false;

    const expected = Buffer.from(rawKey, "base64url");
    if (expected.length < 32 || expected.length > 128) return false;
    const actual = await deriveKey(
      password,
      Buffer.from(rawSalt, "base64url"),
      expected.length,
      options,
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const COMMON_PASSWORDS = new Set([
  "1234567890",
  "password123",
  "qwerty12345",
  "administrador",
  "adminadmin",
  "paulapeixoto",
]);

export function validatePassword(password: string): string | null {
  if (password.length < 10) return "A password deve ter pelo menos 10 caracteres.";
  if (password.length > 256) return "A password é demasiado longa.";
  if (COMMON_PASSWORDS.has(password.toLocaleLowerCase("pt-PT"))) {
    return "Escolha uma password menos comum.";
  }
  return null;
}
