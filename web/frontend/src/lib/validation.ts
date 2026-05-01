// Single source of truth for input validation regexes on the web side.
// MUST stay in sync with web/backend/src/services/validation.ts and
// mobile/lib/features/auth/domain/validation.dart — if you change one,
// change all three.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// E.164: leading + and 10–15 digits.
export const PHONE_RE = /^\+\d{10,15}$/;

export const MANAGER_CODE_RE = /^\d{6}$/;

// 8+ chars, ≥1 uppercase Latin, ≥1 lowercase Latin, ≥1 digit, only Latin
// letters and common punctuation.
export const PASSWORD_RE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':",.<>?/`~|\\]{8,}$/;

export const isValidEmail = (v: string) => EMAIL_RE.test(v);
export const isValidPhone = (v: string) => PHONE_RE.test(v);
export const isValidManagerCode = (v: string) => MANAGER_CODE_RE.test(v);
export const isValidPassword = (v: string) => PASSWORD_RE.test(v);
