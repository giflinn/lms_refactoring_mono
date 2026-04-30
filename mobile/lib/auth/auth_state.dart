enum Role { client, manager, seniorManager, admin }

Role roleFromString(String s) {
  switch (s) {
    case 'client':
      return Role.client;
    case 'manager':
      return Role.manager;
    case 'senior_manager':
      return Role.seniorManager;
    case 'admin':
      return Role.admin;
    default:
      throw ArgumentError('Unknown role: $s');
  }
}

String roleLabel(Role role) {
  switch (role) {
    case Role.client:
      return 'Клиент';
    case Role.manager:
      return 'Менеджер';
    case Role.seniorManager:
      return 'Старший менеджер';
    case Role.admin:
      return 'Администратор';
  }
}

class AppUser {
  final String id;
  final String firebaseUid;
  final String email;
  final Role role;
  final String firstName;
  final String lastName;
  final String? phone;
  final String? managerCode;
  final String? managerId;
  final String? avatarUrl;
  final DateTime createdAt;

  const AppUser({
    required this.id,
    required this.firebaseUid,
    required this.email,
    required this.role,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.managerCode,
    required this.managerId,
    required this.avatarUrl,
    required this.createdAt,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as String,
      firebaseUid: json['firebaseUid'] as String,
      email: json['email'] as String,
      role: roleFromString(json['role'] as String),
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      phone: json['phone'] as String?,
      managerCode: json['managerCode'] as String?,
      managerId: json['managerId'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

/// State carried from a successful Google sign-in to the "complete profile"
/// page. The Firebase user is already created and signed in; we just need
/// the rest of the profile fields before calling /auth/sync.
class PendingGoogleProfile {
  final String email;
  final String firstName;
  final String lastName;
  /// Photo URL from the Google account. Not used for storage (we only persist
  /// avatars uploaded to our backend), but we could prefetch & re-upload later.
  final String? googlePhotoUrl;

  const PendingGoogleProfile({
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.googlePhotoUrl,
  });
}

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
