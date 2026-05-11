// Mirror of web/backend/src/services/validation.ts — keep these in sync.
// Rules: 8+ chars, ≥1 uppercase Latin, ≥1 lowercase Latin, ≥1 digit, only
// Latin letters and common punctuation (no Cyrillic).
final _passwordRe = RegExp(
  r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)'
  r"""[A-Za-z0-9!@#\$%^&*()_+\-=\[\]{};':",.<>?/`~|\\]{8,}$""",
);

bool isValidPassword(String value) => _passwordRe.hasMatch(value);

final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

bool isValidEmail(String value) => _emailRe.hasMatch(value);

final _managerCodeRe = RegExp(r'^\d{6}$');

bool isValidManagerCode(String value) => _managerCodeRe.hasMatch(value);

final _otpRe = RegExp(r'^\d{6}$');

bool isValidOtp(String value) => _otpRe.hasMatch(value);

// E.164 international format — mirror of backend `isValidPhone`. The mobile
// `phone_form_field` outputs phones in this canonical form.
final _phoneRe = RegExp(r'^\+\d{10,15}$');

bool isValidPhone(String value) => _phoneRe.hasMatch(value);

/// Trimmed name must be 1..50 chars. Used for first/last name on profile edit.
bool isValidName(String value) {
  final trimmed = value.trim();
  return trimmed.isNotEmpty && trimmed.length <= 50;
}
