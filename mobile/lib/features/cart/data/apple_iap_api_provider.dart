import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_provider.dart';
import 'apple_iap_api.dart';

final appleIapApiProvider = Provider<AppleIapApi>(
  (ref) => AppleIapApi(ref.watch(apiClientProvider)),
);
