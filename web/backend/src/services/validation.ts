// Single source of truth for password rules — same regex enforced on the
// mobile client (in lib/auth/validation.dart) so users get instant feedback,
// duplicated server-side because we never trust the client.
//
// Rules: 8+ chars, ≥1 uppercase Latin, ≥1 lowercase Latin, ≥1 digit, only Latin
// letters and common punctuation (no Cyrillic).
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':",.<>?/`~|\\]{8,}$/;

export function isValidPassword(password: string): boolean {
  return PASSWORD_RE.test(password);
}

// E.164 international format: leading + and 10–15 digits. Phone is stored in
// this canonical form on the client (intl_phone_field outputs it).
const PHONE_RE = /^\+\d{10,15}$/;

export function isValidPhone(phone: string): boolean {
  return PHONE_RE.test(phone);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

const MANAGER_CODE_RE = /^\d{6}$/;

export function isValidManagerCode(code: string): boolean {
  return MANAGER_CODE_RE.test(code);
}
