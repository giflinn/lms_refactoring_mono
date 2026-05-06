import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../../../core/domain/app_user.dart';
import '../../../../core/log.dart';
import '../../../catalog/presentation/controller/favorite_ids_controller.dart';
import '../../../catalog/presentation/controller/favorite_products_controller.dart';
import '../../../catalog/presentation/controller/home_controller.dart';
import '../../../chat/data/chat_socket.dart';
import '../../../chat/presentation/controller/chat_controllers.dart';
import '../../data/auth_api.dart';
import '../../data/auth_api_provider.dart';
import '../../domain/registration_data.dart';

// Catalog/favorites + chat providers are imported here so signOut() can
// invalidate them when the session ends — otherwise account B inherits
// account A's hearts, catalog snapshot, threads, and (worst) socket bound
// to A's token. Crosses the "no presentation imports across features"
// guideline deliberately; the alternatives (a clearables registry or
// routing-side invalidation) are heavier for this small cleanup. If a
// fourth feature joins, promote to a `core/lifecycle/` helper.

final authProvider = AsyncNotifierProvider<AuthController, AppUser?>(
  AuthController.new,
);

/// Thrown by [signIn] when Firebase auth succeeded but the user hasn't
/// confirmed their email yet. The login page catches it to push the OTP
/// entry screen at /email-verification while keeping the Firebase session
/// open.
class EmailNotVerifiedException implements Exception {
  const EmailNotVerifiedException();
}

/// Result of [AuthController.signInWithGoogle]. Either the user is fully set up
/// and signed in (controller state is now AsyncData(user)), or this is a new
/// Google identity that hasn't completed the profile form yet — the caller
/// should push CompleteProfilePage with [pendingProfile].
sealed class GoogleSignInResult {
  const GoogleSignInResult();
}

class GoogleSignInLoggedIn extends GoogleSignInResult {
  const GoogleSignInLoggedIn();
}

class GoogleSignInNeedsProfile extends GoogleSignInResult {
  final PendingGoogleProfile profile;
  const GoogleSignInNeedsProfile(this.profile);
}

class GoogleSignInCancelled extends GoogleSignInResult {
  const GoogleSignInCancelled();
}

class AuthController extends AsyncNotifier<AppUser?> {
  AuthApi get _api => ref.read(authApiProvider);

  @override
  Future<AppUser?> build() async {
    final fbUser = await fb.FirebaseAuth.instance.authStateChanges().first;
    if (fbUser == null) return null;
    if (!fbUser.emailVerified) {
      // Stay signed-in to Firebase so the user can resume the OTP flow on
      // /email-verification (the verify endpoint needs a valid ID token).
      // Surfacing them as logged-out keeps them off /home until verified.
      return null;
    }
    return _resolveExisting(fbUser);
  }

  /// Re-fetches /me using the current Firebase user so server-side profile
  /// changes (e.g. admin flipping clientCategory) surface without re-login.
  /// Used by pull-to-refresh on profile-driven screens.
  Future<void> refresh() async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null || !fbUser.emailVerified) return;
    state = AsyncData(await _resolveExisting(fbUser));
  }

  Future<AppUser> _resolveExisting(fb.User fbUser) async {
    final token = await fbUser.getIdToken();
    if (token == null) {
      throw StateError('Firebase user has no ID token');
    }
    final existing = await _api.fetchMe(token);
    if (existing != null) return existing;
    return _api.syncExisting(token);
  }

  Future<void> signIn(String email, String password) async {
    final cred = await fb.FirebaseAuth.instance.signInWithEmailAndPassword(
      email: email,
      password: password,
    );
    final fbUser = cred.user!;
    if (!fbUser.emailVerified) {
      // Stay signed-in: /email-verification calls the verify endpoint with the
      // current ID token. authProvider state stays null (build returns null
      // for unverified users) so the router still treats them as logged-out.
      throw const EmailNotVerifiedException();
    }
    final user = await _resolveExisting(fbUser);
    state = AsyncData(user);
  }

  /// Creates the Firebase user, syncs the DB row, and asks the backend to
  /// email a 6-digit OTP. The Firebase user stays signed-in so the
  /// /email-verification page can call the verify endpoint with their ID
  /// token; authProvider state stays null until they enter the code.
  Future<void> signUp(RegistrationData data) async {
    final cred = await fb.FirebaseAuth.instance.createUserWithEmailAndPassword(
      email: data.email,
      password: data.password,
    );
    final fbUser = cred.user!;
    try {
      final token = await fbUser.getIdToken();
      if (token == null) throw StateError('Firebase user has no ID token');
      await _api.syncRegistration(idToken: token, data: data);
      await _api.requestEmailVerification(token);
    } catch (e, st) {
      // If profile sync or OTP request fails the Firebase user is "orphaned" —
      // it would block re-registration with email-already-in-use AND can't log
      // in because there's no verified DB row. Delete it so the user can
      // retry cleanly.
      logd('signUp failed, cleaning up orphan firebase user', e, st);
      try {
        await fbUser.delete();
      } catch (e2) {
        logd('orphan firebase user delete failed', e2);
      }
      await fb.FirebaseAuth.instance.signOut();
      rethrow;
    }
  }

  /// Re-sends the verification OTP for the currently signed-in (but not yet
  /// verified) Firebase user. Called from /email-verification.
  Future<void> resendEmailVerification() async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) {
      throw StateError('No Firebase user — cannot resend verification');
    }
    final token = await fbUser.getIdToken();
    if (token == null) throw StateError('Firebase user has no ID token');
    await _api.requestEmailVerification(token);
  }

  /// Submits the 6-digit OTP. On success the backend marks the Firebase user
  /// emailVerified=true; we force-refresh the local Firebase claims and lift
  /// the auth state so the router redirects to /home.
  Future<void> verifyEmailCode(String code) async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) {
      throw StateError('No Firebase user — cannot verify email');
    }
    final token = await fbUser.getIdToken();
    if (token == null) throw StateError('Firebase user has no ID token');
    await _api.verifyEmailCode(idToken: token, code: code);

    // Pull the updated emailVerified=true claim from Firebase. reload()
    // refreshes user metadata; getIdToken(true) forces a new token with the
    // updated claim so subsequent backend calls see the verified state.
    await fbUser.reload();
    final refreshed = fb.FirebaseAuth.instance.currentUser!;
    await refreshed.getIdToken(true);
    final user = await _resolveExisting(refreshed);
    state = AsyncData(user);
  }

  /// Google sign-in flow:
  /// 1) Pop the Google account picker, get OAuth credentials.
  /// 2) Sign in to Firebase with those credentials.
  /// 3) If we already have a DB row → resolve and we're logged in.
  /// 4) If not → return [GoogleSignInNeedsProfile] so the UI can push the
  ///    CompleteProfilePage. The Firebase user stays signed-in (verified) so
  ///    /auth/sync can be called from the profile-completion screen.
  Future<GoogleSignInResult> signInWithGoogle() async {
    final googleUser = await GoogleSignIn().signIn();
    if (googleUser == null) {
      // User cancelled the picker.
      return const GoogleSignInCancelled();
    }
    final googleAuth = await googleUser.authentication;
    final cred = fb.GoogleAuthProvider.credential(
      accessToken: googleAuth.accessToken,
      idToken: googleAuth.idToken,
    );
    final fbCred = await fb.FirebaseAuth.instance.signInWithCredential(cred);
    final fbUser = fbCred.user!;

    final token = await fbUser.getIdToken();
    if (token == null) throw StateError('Firebase user has no ID token');

    final existing = await _api.fetchMe(token);
    if (existing != null) {
      state = AsyncData(existing);
      return const GoogleSignInLoggedIn();
    }

    final fullName = (fbUser.displayName ?? googleUser.displayName ?? '')
        .trim();
    final parts = fullName.split(RegExp(r'\s+'));
    final firstName = parts.isNotEmpty ? parts.first : '';
    final lastName = parts.length > 1 ? parts.sublist(1).join(' ') : '';

    return GoogleSignInNeedsProfile(
      PendingGoogleProfile(
        email: fbUser.email ?? googleUser.email,
        firstName: firstName,
        lastName: lastName,
        googlePhotoUrl: fbUser.photoURL ?? googleUser.photoUrl,
      ),
    );
  }

  /// Called from CompleteProfilePage after a Google sign-in. The Firebase user
  /// already exists and is signed in; we just sync the profile to our DB.
  Future<void> completeGoogleProfile({
    required String firstName,
    required String lastName,
    required String phone,
    required String? managerCode,
    required bool termsAccepted,
  }) async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) {
      throw StateError('No Firebase user — cannot complete profile');
    }
    final token = await fbUser.getIdToken();
    if (token == null) throw StateError('Firebase user has no ID token');

    final user = await _api.syncRegistration(
      idToken: token,
      data: RegistrationData(
        email: fbUser.email!,
        password:
            '', // not used by /auth/sync; firebase already has the OAuth creds
        firstName: firstName,
        lastName: lastName,
        phone: phone,
        managerCode: managerCode,
        avatarPath: null,
        termsAccepted: termsAccepted,
      ),
    );
    state = AsyncData(user);
  }

  /// Cancel an in-progress Google sign-up (the user backed out of the
  /// CompleteProfilePage). Removes the Firebase user so they can retry cleanly.
  Future<void> abandonGoogleSignUp() async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser != null) {
      try {
        await fbUser.delete();
      } catch (e) {
        logd('abandonGoogleSignUp: firebase user delete failed', e);
      }
    }
    try {
      await GoogleSignIn().signOut();
    } catch (e) {
      logd('abandonGoogleSignUp: google signOut failed', e);
    }
    await fb.FirebaseAuth.instance.signOut();
  }

  Future<void> requestPasswordReset(String email) =>
      _api.requestPasswordReset(email);

  Future<String> verifyResetCode({
    required String email,
    required String code,
  }) => _api.verifyResetCode(email: email, code: code);

  Future<void> completePasswordReset({
    required String resetToken,
    required String newPassword,
  }) => _api.completePasswordReset(
    resetToken: resetToken,
    newPassword: newPassword,
  );

  Future<void> signOut() async {
    try {
      await GoogleSignIn().signOut();
    } catch (e) {
      logd('signOut: google signOut failed (likely not a google user)', e);
    }
    await fb.FirebaseAuth.instance.signOut();
    // Clear cross-session caches so the next user doesn't inherit hearts /
    // catalog snapshot / chat threads / socket from this session.
    ref.invalidate(favoriteIdsProvider);
    ref.invalidate(favoriteProductsProvider);
    ref.invalidate(homeCatalogProvider);
    // Chat: invalidate stateful providers BEFORE the socket — their
    // onDispose cancels stream subscriptions on the live socket; tearing
    // the socket down first would leave them subscribing to a closed
    // controller. Socket invalidation triggers ChatSocket.dispose().
    ref.invalidate(clientChatProvider);
    ref.invalidate(staffThreadsProvider);
    ref.invalidate(unreadCountProvider);
    ref.invalidate(chatSocketProvider);
    state = const AsyncData(null);
  }
}
