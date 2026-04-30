import 'package:flutter/foundation.dart';

/// Lightweight debug logger. Prints in debug builds, no-op in release.
/// Use for breadcrumbs around network calls, auth flows, and silent error
/// fallbacks — anything you'd want to see when reproducing a bug.
void logd(String message, [Object? error, StackTrace? stack]) {
  if (!kDebugMode) return;
  debugPrint('[lms] $message');
  if (error != null) debugPrint('  error: $error');
  if (stack != null) debugPrint(stack.toString());
}
