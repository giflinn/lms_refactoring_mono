/// Submitted to /auth/sync on first sign-in (email or OAuth). After sync the
/// row exists in our DB and subsequent /auth/sync calls just echo it back.
class RegistrationData {
  final String email;
  final String password;
  final String firstName;
  final String lastName;

  /// E.164 format, e.g. '+77081234567'.
  final String phone;

  /// 6-digit code, or null if user left the field empty (server picks the
  /// fallback manager).
  final String? managerCode;

  /// Local file path of the avatar image, or null if the user didn't pick one.
  final String? avatarPath;
  final bool termsAccepted;

  const RegistrationData({
    required this.email,
    required this.password,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.managerCode,
    required this.avatarPath,
    required this.termsAccepted,
  });
}

/// State carried from a successful OAuth sign-in (Google or Apple) to the
/// "complete profile" page. The Firebase user is already created and signed
/// in; we just need the rest of the profile fields before calling /auth/sync.
///
/// Apple only returns `givenName`/`familyName` on the FIRST sign-in. If a
/// user has signed in with Apple before and we don't have their name, the
/// fields will arrive empty — the user will fill them on this page.
class PendingOAuthProfile {
  final String email;
  final String firstName;
  final String lastName;

  /// Optional photo URL (Google provides it, Apple does not). Not used for
  /// storage today — we only persist avatars uploaded to our backend.
  final String? photoUrl;

  const PendingOAuthProfile({
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.photoUrl,
  });
}
