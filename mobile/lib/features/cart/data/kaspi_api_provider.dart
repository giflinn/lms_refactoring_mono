import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_provider.dart';
import 'kaspi_api.dart';

final kaspiApiProvider = Provider<KaspiApi>(
  (ref) => KaspiApi(ref.watch(apiClientProvider)),
);
