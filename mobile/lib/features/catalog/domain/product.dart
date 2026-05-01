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
    required this.isPromo,
    required this.isTopSearch,
    required this.coverKind,
    required this.coverImageUrl,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    final cat = json['category'] as Map<String, dynamic>?;
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
      isPromo: json['isPromo'] as bool? ?? false,
      isTopSearch: json['isTopSearch'] as bool? ?? false,
      coverKind: _coverKindFromString(json['coverKind'] as String),
      coverImageUrl: json['coverImageUrl'] as String?,
    );
  }
}
