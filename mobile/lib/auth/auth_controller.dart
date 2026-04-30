import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_api.dart';
import 'auth_state.dart';

final authProvider =
    AsyncNotifierProvider<AuthController, AppUser?>(AuthController.new);

class AuthController extends AsyncNotifier<AppUser?> {
  @override
  Future<AppUser?> build() async {
    final fbUser = await fb.FirebaseAuth.instance.authStateChanges().first;
    if (fbUser == null) return null;
    return _resolveUser(fbUser);
  }

  Future<AppUser> _resolveUser(fb.User fbUser) async {
    final token = await fbUser.getIdToken();
    if (token == null) {
      throw StateError('Firebase user has no ID token');
    }
    final existing = await AuthApi.fetchMe(token);
    if (existing != null) return existing;
    return AuthApi.syncUser(token);
  }

  Future<void> signIn(String email, String password) async {
    final cred = await fb.FirebaseAuth.instance.signInWithEmailAndPassword(
      email: email,
      password: password,
    );
    final user = await _resolveUser(cred.user!);
    state = AsyncData(user);
  }

  Future<void> signOut() async {
    await fb.FirebaseAuth.instance.signOut();
    state = const AsyncData(null);
  }
}
