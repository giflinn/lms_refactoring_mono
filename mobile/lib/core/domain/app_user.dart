import 'role.dart';
import 'server_time.dart';

/// The signed-in user's profile, as stored in our Postgres `users` table and
/// returned by /me and /auth/sync. Cross-feature: every screen that gates on
/// identity reads this. Lives in core/ (not features/auth) because non-auth
/// features will need it once they exist.
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
  /// One of 'new' | 'regular' | 'vip'. Set manually by admin; defaults to 'new'
  /// at registration. Null on staff rows (the column is non-null in DB but
  /// stays meaningless for non-clients).
  final String? clientCategory;
  /// `YYYY-MM-DD` string from the DB `date` column, or null if unset.
  final String? birthDate;
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
    required this.clientCategory,
    required this.birthDate,
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
      clientCategory: json['clientCategory'] as String?,
      birthDate: json['birthDate'] as String?,
      createdAt: parseServerTime(json['createdAt'] as String),
    );
  }
}
