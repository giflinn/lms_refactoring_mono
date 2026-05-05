import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_provider.dart';
import 'cancellations_api.dart';

final cancellationsApiProvider = Provider<CancellationsApi>((ref) {
  return CancellationsApi(ref.watch(apiClientProvider));
});
