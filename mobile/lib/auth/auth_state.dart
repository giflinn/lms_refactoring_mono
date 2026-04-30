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
  final DateTime createdAt;

  const AppUser({
    required this.id,
    required this.firebaseUid,
    required this.email,
    required this.role,
    required this.createdAt,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as String,
      firebaseUid: json['firebaseUid'] as String,
      email: json['email'] as String,
      role: roleFromString(json['role'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
