import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/telegram_api.dart';
import '../../data/telegram_api_provider.dart';
import '../../domain/telegram_link.dart';

/// Loads + caches the calling user's Telegram link state. Order detail page
/// reads it to decide which CTA to render; profile / settings page can hang
/// the "Отвязать" action off the same state.
class TelegramLinkController
    extends AsyncNotifier<TelegramLinkStatus> {
  late TelegramApi _api;

  @override
  Future<TelegramLinkStatus> build() async {
    _api = ref.watch(telegramApiProvider);
    return _load();
  }

  Future<TelegramLinkStatus> _load() async {
    final token = await _idToken();
    return _api.getStatus(token);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_load);
  }

  /// Generates a fresh link token + deep link. Doesn't mutate cached state —
  /// the link only becomes a "yes I'm linked" once the bot confirms via
  /// /start. Mobile pings refresh() after returning from Telegram to pick
  /// up the new state.
  Future<TelegramLinkToken> requestLinkToken() async {
    return _api.requestLinkToken(await _idToken());
  }

  Future<void> unlink() async {
    await _api.unlink(await _idToken());
    state = const AsyncValue.data(TelegramLinkStatus.notLinked());
  }

  Future<String> _idToken() async {
    final fbUser = FirebaseAuth.instance.currentUser;
    if (fbUser == null) {
      throw StateError('not_authenticated');
    }
    final t = await fbUser.getIdToken();
    if (t == null || t.isEmpty) {
      throw StateError('id_token_unavailable');
    }
    return t;
  }
}

final telegramLinkProvider =
    AsyncNotifierProvider<TelegramLinkController, TelegramLinkStatus>(
  TelegramLinkController.new,
);
