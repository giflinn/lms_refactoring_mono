import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_provider.dart';
import 'bcc_payment_api.dart';

final bccPaymentApiProvider = Provider<BccPaymentApi>(
  (ref) => BccPaymentApi(ref.watch(apiClientProvider)),
);
