import '../../../core/domain/server_time.dart';

/// Cover rendering mode mirrored from the backend enum. Determines how the
/// product card is composed:
/// - [preset]      → no image; built-in purple gradient + overlay (chip, title,
///                   subtitle, button) drawn on top.
/// - [customBg]    → network image as background + the same overlay.
/// - [customFull]  → just the network image, no overlay.
enum ProductCoverKind { preset, customBg, customFull }

ProductCoverKind _coverKindFromString(String s) {
  switch (s) {
    case 'preset':
      return ProductCoverKind.preset;
    case 'custom_bg':
      return ProductCoverKind.customBg;
    case 'custom_full':
      return ProductCoverKind.customFull;
    default:
      return ProductCoverKind.preset;
  }
}

class ProductCategorySummary {
  final String id;
  final String name;
  const ProductCategorySummary({required this.id, required this.name});

  factory ProductCategorySummary.fromJson(Map<String, dynamic> json) {
    return ProductCategorySummary(
      id: json['id'] as String,
      name: json['name'] as String,
    );
  }
}

/// Catalog item exposed to clients. Mirror of the admin Product type minus the
/// admin-only fields (isActive — server already filters; createdAt/updatedAt
/// — not used in the UI).
class Product {
  final String id;
  final String categoryId;
  final ProductCategorySummary? category;
  final String title;
  final String? subtitle;
  final String description;
  final String buttonText;
  final String? price; // null = "по запросу"
  final int daysUntilCancel;
  // null = ordinary product (digital good / non-bookable). Non-null = the
  // product consumes a coach slot of this length when purchased.
  final int? durationMinutes;
  // Slot types this product can be booked against. Empty when not bookable.
  final List<String> slotTypeIds;
  final bool isPromo;
  final bool isTopSearch;
  final ProductCoverKind coverKind;
  // Path under `/product-images/<uuid>.<ext>` — relative to API base. Widgets
  // resolve to a full URL via [ApiClient.baseUrl].
  final String? coverImageUrl;

  const Product({
    required this.id,
    required this.categoryId,
    required this.category,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.buttonText,
    required this.price,
    required this.daysUntilCancel,
    required this.durationMinutes,
    required this.slotTypeIds,
    required this.isPromo,
    required this.isTopSearch,
    required this.coverKind,
    required this.coverImageUrl,
  });

  bool get isBookable => durationMinutes != null && slotTypeIds.isNotEmpty;

  factory Product.fromJson(Map<String, dynamic> json) {
    final cat = json['category'] as Map<String, dynamic>?;
    final dur = json['durationMinutes'];
    return Product(
      id: json['id'] as String,
      categoryId: json['categoryId'] as String,
      category: cat == null ? null : ProductCategorySummary.fromJson(cat),
      title: json['title'] as String,
      subtitle: json['subtitle'] as String?,
      description: json['description'] as String,
      buttonText: json['buttonText'] as String,
      price: json['price'] as String?,
      daysUntilCancel: (json['daysUntilCancel'] as num).toInt(),
      durationMinutes: dur == null ? null : (dur as num).toInt(),
      slotTypeIds:
          (json['slotTypeIds'] as List?)?.cast<String>() ?? const <String>[],
      isPromo: json['isPromo'] as bool? ?? false,
      isTopSearch: json['isTopSearch'] as bool? ?? false,
      coverKind: _coverKindFromString(json['coverKind'] as String),
      coverImageUrl: json['coverImageUrl'] as String?,
    );
  }
}

/// One bookable start window inside a coach slot, already sliced to match the
/// product's durationMinutes by the server. The mobile UI groups these by day
/// and renders them as time pills.
class AvailableStart {
  final DateTime startsAt;
  final DateTime endsAt;

  const AvailableStart({required this.startsAt, required this.endsAt});

  factory AvailableStart.fromJson(Map<String, dynamic> json) {
    return AvailableStart(
      startsAt: parseServerTime(json['startsAt'] as String),
      endsAt: parseServerTime(json['endsAt'] as String),
    );
  }
}
