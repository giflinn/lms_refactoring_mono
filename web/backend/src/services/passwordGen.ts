import { randomInt } from "node:crypto";
import { isValidPassword } from "./validation";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGIT = "0123456789";
const SYMBOL = "!@#$%^&*";
const ALPHABET = UPPER + LOWER + DIGIT + SYMBOL;

function pick(chars: string): string {
  return chars[randomInt(0, chars.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Generates a 12-character password guaranteed to satisfy isValidPassword:
// at least one upper, one lower, one digit; only Latin chars + safe symbols.
// Used for staff onboarding (admin creates manager, password is emailed).
export function generateStrongPassword(): string {
  for (let attempt = 0; attempt < 5; attempt++) {
    const required = [pick(UPPER), pick(LOWER), pick(DIGIT)];
    const filler: string[] = [];
    for (let i = 0; i < 9; i++) filler.push(pick(ALPHABET));
    const password = shuffle([...required, ...filler]).join("");
    if (isValidPassword(password)) return password;
  }
  // Should never happen — by construction we always have ≥1 upper/lower/digit.
  throw new Error("Failed to generate a valid password");
}
