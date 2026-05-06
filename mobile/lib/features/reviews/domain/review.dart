/// Mirrors the backend `review_status` enum. Drives status pills in
/// "Мои отзывы" and the staff moderation feed.
enum ReviewStatus { pending, published, deleted }

ReviewStatus reviewStatusFromString(String s) {
  switch (s) {
    case 'pending':
      return ReviewStatus.pending;
    case 'published':
      return ReviewStatus.published;
    case 'deleted':
      return ReviewStatus.deleted;
  }
  throw ArgumentError('unknown review_status: $s');
}

class ReviewUserRef {
  final String id;
  final String firstName;
  final String lastName;
  final String? avatarUrl;

  const ReviewUserRef({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
  });

  factory ReviewUserRef.fromJson(Map<String, dynamic> json) {
    return ReviewUserRef(
      id: json['id'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      avatarUrl: json['avatarUrl'] as String?,
    );
  }

  String get fullName {
    final parts =
        [firstName.trim(), lastName.trim()].where((s) => s.isNotEmpty);
    return parts.join(' ');
  }
}

class ReviewProductRef {
  final String id;
  final String title;

  const ReviewProductRef({required this.id, required this.title});

  factory ReviewProductRef.fromJson(Map<String, dynamic> json) {
    return ReviewProductRef(
      id: json['id'] as String,
      title: json['title'] as String,
    );
  }
}

class ReviewReply {
  final String id;
  final String text;
  final DateTime createdAt;
  final ReviewUserRef author;

  const ReviewReply({
    required this.id,
    required this.text,
    required this.createdAt,
    required this.author,
  });

  factory ReviewReply.fromJson(Map<String, dynamic> json) {
    return ReviewReply(
      id: json['id'] as String,
      text: json['text'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      author: ReviewUserRef.fromJson(json['author'] as Map<String, dynamic>),
    );
  }
}

class Review {
  final String id;
  final int rating;
  final String text;
  final ReviewStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final ReviewUserRef client;
  final ReviewProductRef product;
  final List<ReviewReply> replies;

  const Review({
    required this.id,
    required this.rating,
    required this.text,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.client,
    required this.product,
    required this.replies,
  });

  factory Review.fromJson(Map<String, dynamic> json) {
    return Review(
      id: json['id'] as String,
      rating: (json['rating'] as num).toInt(),
      text: json['text'] as String,
      status: reviewStatusFromString(json['status'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      client: ReviewUserRef.fromJson(json['client'] as Map<String, dynamic>),
      product:
          ReviewProductRef.fromJson(json['product'] as Map<String, dynamic>),
      replies: (json['replies'] as List<dynamic>?)
              ?.map((e) => ReviewReply.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }
}

const _ruMonthsGenitive = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/// "10.03.2024" — Figma format for the "Мои отзывы" footer.
String formatReviewDateShort(DateTime d) {
  final local = d.toLocal();
  final dd = local.day.toString().padLeft(2, '0');
  final mm = local.month.toString().padLeft(2, '0');
  return '$dd.$mm.${local.year}';
}

/// "28 марта, 2024" — Figma format for the public review card.
String formatReviewDateLong(DateTime d) {
  final local = d.toLocal();
  return '${local.day} ${_ruMonthsGenitive[local.month - 1]}, ${local.year}';
}

/// "09:12" — Figma format for time-of-day on review cards.
String formatReviewTime(DateTime d) {
  final local = d.toLocal();
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return '$hh:$mm';
}
