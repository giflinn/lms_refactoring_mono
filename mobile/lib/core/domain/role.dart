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
