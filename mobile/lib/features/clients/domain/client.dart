import '../../../core/domain/server_time.dart';

/// One row in the staff "Клиенты" list and the data backing the client
/// profile screen. Mirrors the backend `GET /clients` payload. Only the
/// fields used by the staff UI are kept here — backend may return more
/// (e.g. nested manager summary) which we ignore on this side.
class Client {
  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String? phone;
  final String? avatarUrl;
  final String? comment;
  /// `YYYY-MM-DD` from the DB `date` column, or null if unset.
  final String? birthDate;
  /// `'new' | 'regular' | 'vip'`. Drives the VIP chip on the list tile.
  final String clientCategory;
  final String? managerId;
  final DateTime createdAt;

  const Client({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phone,
    required this.avatarUrl,
    required this.comment,
    required this.birthDate,
    required this.clientCategory,
    required this.managerId,
    required this.createdAt,
  });

  String get fullName {
    final parts = [
      firstName.trim(),
      lastName.trim(),
    ].where((s) => s.isNotEmpty);
    return parts.join(' ');
  }

  Client copyWith({
    String? phone,
    String? comment,
    String? birthDate,
    String? clientCategory,
    String? avatarUrl,
  }) {
    return Client(
      id: id,
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: phone ?? this.phone,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      comment: comment ?? this.comment,
      birthDate: birthDate ?? this.birthDate,
      clientCategory: clientCategory ?? this.clientCategory,
      managerId: managerId,
      createdAt: createdAt,
    );
  }

  factory Client.fromJson(Map<String, dynamic> json) {
    return Client(
      id: json['id'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      email: json['email'] as String,
      phone: json['phone'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      comment: json['comment'] as String?,
      birthDate: json['birthDate'] as String?,
      clientCategory: (json['clientCategory'] as String?) ?? 'new',
      managerId: json['managerId'] as String?,
      createdAt: parseServerTime(json['createdAt'] as String),
    );
  }
}

/// One page of the paginated `GET /clients` response. The list controller
/// concatenates pages on lazy-load.
class ClientsPage {
  final List<Client> clients;
  final int page;
  final int pageSize;
  final int total;

  const ClientsPage({
    required this.clients,
    required this.page,
    required this.pageSize,
    required this.total,
  });

  bool get hasMore => page * pageSize < total;
}

/// "13.01.2000" — the same format the personal-data screen uses for the
/// read-only birth-date row. Kept here so this feature doesn't import from
/// `cabinet/`. `null` and unparseable input both render as empty.
String formatBirthDateDdMmYyyy(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final d = DateTime.tryParse(iso);
  if (d == null) return '';
  final dd = d.day.toString().padLeft(2, '0');
  final mm = d.month.toString().padLeft(2, '0');
  return '$dd.$mm.${d.year}';
}
