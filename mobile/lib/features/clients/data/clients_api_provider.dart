import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_provider.dart';
import 'clients_api.dart';

final clientsApiProvider = Provider<ClientsApi>((ref) {
  return ClientsApi(ref.watch(apiClientProvider));
});
