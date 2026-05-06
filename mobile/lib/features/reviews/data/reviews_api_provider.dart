import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_provider.dart';
import 'reviews_api.dart';

final reviewsApiProvider = Provider<ReviewsApi>((ref) {
  return ReviewsApi(ref.watch(apiClientProvider));
});
