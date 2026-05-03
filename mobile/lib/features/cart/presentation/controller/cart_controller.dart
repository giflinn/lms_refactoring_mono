import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/cart_item.dart';

/// In-memory cart. Persisted only for the current session — order creation /
/// server sync lands in a follow-up step. State is kept here so any tab can
/// observe it (the bottom-nav badge, in particular).
class CartController extends Notifier<List<CartItem>> {
  @override
  List<CartItem> build() => const [];

  void add(CartItem item) {
    final next = [
      for (final existing in state)
        if (existing.productId != item.productId) existing,
      item,
    ];
    state = next;
  }

  void remove(String productId) {
    state = [
      for (final item in state)
        if (item.productId != productId) item,
    ];
  }

  void clear() {
    state = const [];
  }

  num get total => state.fold<num>(0, (sum, item) => sum + item.price);
}

final cartProvider = NotifierProvider<CartController, List<CartItem>>(
  CartController.new,
);
