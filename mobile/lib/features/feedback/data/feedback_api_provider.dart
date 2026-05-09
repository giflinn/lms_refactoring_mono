import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_provider.dart';
import 'feedback_api.dart';

final feedbackApiProvider = Provider<FeedbackApi>(
  (ref) => FeedbackApi(ref.watch(apiClientProvider)),
);
