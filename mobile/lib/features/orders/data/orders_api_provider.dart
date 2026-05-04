import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_provider.dart';
import 'orders_api.dart';

final ordersApiProvider = Provider<OrdersApi>((ref) {
  return OrdersApi(ref.watch(apiClientProvider));
});
