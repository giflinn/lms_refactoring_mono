import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_provider.dart';
import 'chat_api.dart';

final chatApiProvider = Provider<ChatApi>(
  (ref) => ChatApi(ref.watch(apiClientProvider)),
);
