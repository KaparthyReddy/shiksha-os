import { randomInt } from "node:crypto";
import { hash } from "@node-rs/argon2";

// No look-alike characters (0/O, 1/l/I) so temp passwords survive being read aloud or copied.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export const hashPassword = (plain: string) => hash(plain);
