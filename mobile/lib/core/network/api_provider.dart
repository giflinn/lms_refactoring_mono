import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';

/// Singleton [ApiClient] used by every feature's data layer.
/// Override in tests with `overrideWithValue(ApiClient(baseUrl: ..., client: mockHttp))`.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(baseUrl: ApiClient.resolveBaseUrl());
});
