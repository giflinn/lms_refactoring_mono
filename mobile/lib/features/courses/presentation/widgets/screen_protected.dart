import 'package:flutter/material.dart';
import 'package:screen_protector/screen_protector.dart';

/// Wraps a subtree so screenshots and screen recordings of its visible content
/// are blocked while it's mounted.
///
/// Android — `preventScreenshotOn()` flips FLAG_SECURE on the activity window
/// for both stills and recordings. Cleared on dispose because the same flag
/// covers the whole window, not just our subtree.
///
/// iOS — there's no API to block a screenshot itself, but the system fires
/// `UIScreen.capturedDidChangeNotification` whenever a recording or mirroring
/// session starts, and `protectDataLeakageOn()` blurs the displayed content
/// for the duration. The same call also re-issues a blur briefly on the
/// screenshot notification, which is the closest iOS gets to a deterrent.
///
/// Used to gate LMS course / lesson pages so paid content can't be trivially
/// captured.
class ScreenProtected extends StatefulWidget {
  final Widget child;

  const ScreenProtected({super.key, required this.child});

  @override
  State<ScreenProtected> createState() => _ScreenProtectedState();
}

class _ScreenProtectedState extends State<ScreenProtected> {
  @override
  void initState() {
    super.initState();
    // Fire-and-forget: each platform plugin returns a Future but failures here
    // shouldn't block the page. If protection setup fails (e.g. plugin
    // missing on a future platform) the page still renders.
    ScreenProtector.preventScreenshotOn();
    ScreenProtector.protectDataLeakageOn();
  }

  @override
  void dispose() {
    ScreenProtector.preventScreenshotOff();
    ScreenProtector.protectDataLeakageOff();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
