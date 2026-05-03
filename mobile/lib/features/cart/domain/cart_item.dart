import '../../catalog/domain/product.dart';

/// One row in the local cart. Snapshot of the product at the moment the user
/// tapped "В корзину", plus an optional booked start when the product is
/// bookable. Identity is `product.id` — re-adding the same product replaces
/// the prior row (handy when picking a different time on a bookable item).
///
/// Carrying the full [Product] keeps cart-row navigation simple (the product
/// detail route takes a `Product` as `extra`) without an extra fetch when the
/// user taps the row. When/if cart moves to the server, this field gets
/// replaced by a refresh-on-open call against `/catalog/products/:id`.
class CartItem {
  final Product product;

  /// Numeric tenge amount resolved from `product.price` at add-time. Cart only
  /// holds priced items — "по запросу" products route to chat, never here.
  final num price;

  /// Bookable products: the booked start instant. Used to render the
  /// date+time row and (later) to send to the order-creation endpoint.
  final DateTime? bookedStart;

  const CartItem({
    required this.product,
    required this.price,
    this.bookedStart,
  });

  String get productId => product.id;
  String get title => product.title;
  String? get categoryName => product.category?.name;

  /// Free-form fallback for the cart row's date column when there's no
  /// booked start (digital goods etc.) — the product's own subtitle copy.
  String? get subtitleFallback => product.subtitle;
}
