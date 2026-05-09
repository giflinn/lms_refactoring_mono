import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_provider.dart';
import 'legal_api.dart';

final legalApiProvider = Provider<LegalApi>(
  (ref) => LegalApi(ref.watch(apiClientProvider)),
);
