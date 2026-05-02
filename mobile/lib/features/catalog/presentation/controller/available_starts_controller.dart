import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/catalog_api_provider.dart';
import '../../domain/product.dart';

/// Family-keyed cache of available booking windows for a (product, month)
/// pair. The product detail page swaps the family key when the month picker
/// changes; previously-loaded months stay cached so navigating back is
/// instant. Within a month the response is small enough that we don't bother
/// with pagination.
class AvailableStartsArgs {
  final String productId;
  // Local-time first day of the requested month (00:00). The data layer sends
  // the instant in UTC; the backend slices and clips slots to the requested
  // window, so DST/zone math doesn't leak edge cases here.
  final DateTime monthStart;

  const AvailableStartsArgs({
    required this.productId,
    required this.monthStart,
  });

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is AvailableStartsArgs &&
        other.productId == productId &&
        other.monthStart.isAtSameMomentAs(monthStart);
  }

  @override
  int get hashCode =>
      Object.hash(productId, monthStart.millisecondsSinceEpoch);
}

final availableStartsProvider = FutureProvider.family<
    List<AvailableStart>, AvailableStartsArgs>((ref, args) async {
  final fbUser = fb.FirebaseAuth.instance.currentUser;
  if (fbUser == null) {
    throw StateError('No Firebase user — slot lookup requires auth');
  }
  final token = await fbUser.getIdToken();
  if (token == null) throw StateError('Firebase user has no ID token');

  final from = args.monthStart;
  final to = DateTime(
    args.monthStart.year,
    args.monthStart.month + 1,
    args.monthStart.day,
  );

  return ref.read(catalogApiProvider).fetchAvailableStarts(
        idToken: token,
        productId: args.productId,
        from: from,
        to: to,
      );
});
