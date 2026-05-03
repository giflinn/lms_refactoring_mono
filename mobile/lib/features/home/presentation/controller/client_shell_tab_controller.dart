import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Active tab index for the client bottom-nav shell. Lives outside the shell
/// widget so screens pushed on top of it (product detail, search) can flip
/// the tab before popping back — e.g. "Купить сейчас" on a product detail
/// adds the item to cart, jumps to the cart tab, and pops.
class ClientShellTabController extends Notifier<int> {
  @override
  int build() => 0;

  void goTo(int index) {
    state = index;
  }
}

final clientShellTabProvider =
    NotifierProvider<ClientShellTabController, int>(
  ClientShellTabController.new,
);
