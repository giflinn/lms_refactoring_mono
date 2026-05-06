import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_provider.dart';
import 'telegram_api.dart';

final telegramApiProvider = Provider<TelegramApi>(
  (ref) => TelegramApi(ref.watch(apiClientProvider)),
);
