import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/chat_models.dart';
import 'chat_api_provider.dart';

/// One-shot fetch of /support/info at app startup. Mobile uses the values to
/// render the chat help dialog (WhatsApp number + manager hours).
final supportInfoProvider = FutureProvider<SupportInfo>((ref) async {
  final api = ref.watch(chatApiProvider);
  return api.fetchSupportInfo();
});
