import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local on/off for "this device wants pushes from our backend". When OFF we
/// delete the FCM token from `/me/fcm-tokens` so the server skips this device;
/// when ON we (re)register it. Defaults to ON. Independent of the OS-level
/// notification permission — that one lives in system settings.
class PushPreferenceController extends AsyncNotifier<bool> {
  static const _key = 'push_enabled';

  @override
  Future<bool> build() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_key) ?? true;
  }

  Future<void> set(bool enabled) async {
    state = AsyncData(enabled);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key, enabled);
  }
}

final pushPreferenceProvider =
    AsyncNotifierProvider<PushPreferenceController, bool>(
  PushPreferenceController.new,
);
