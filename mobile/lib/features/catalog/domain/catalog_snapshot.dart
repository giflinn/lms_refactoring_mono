import 'product.dart';

class CatalogCategory {
  final String id;
  final String name;
  const CatalogCategory({required this.id, required this.name});

  factory CatalogCategory.fromJson(Map<String, dynamic> json) {
    return CatalogCategory(
      id: json['id'] as String,
      name: json['name'] as String,
    );
  }
}

/// Snapshot of the entire client-visible catalog: every active category and
/// every active product. Mobile filters/groups locally; the dataset is small
/// (tens to low hundreds) and re-fetching per category would cost extra
/// round-trips with no benefit.
class CatalogSnapshot {
  final List<CatalogCategory> categories;
  final List<Product> products;

  const CatalogSnapshot({
    required this.categories,
    required this.products,
  });

  /// Categories that actually contain at least one product. Tab strip uses
  /// this to avoid showing empty filters.
  List<CatalogCategory> get categoriesWithProducts {
    final ids = products.map((p) => p.categoryId).toSet();
    return categories.where((c) => ids.contains(c.id)).toList();
  }

  List<Product> get promo =>
      products.where((p) => p.isPromo).toList(growable: false);

  List<Product> productsForCategory(String categoryId) =>
      products.where((p) => p.categoryId == categoryId).toList(growable: false);
}
