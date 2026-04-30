import 'package:flutter/material.dart';

/// Wrap a screen with this so tapping anywhere outside a text field hides the
/// keyboard. iOS users expect this; without it the keyboard stays up forever
/// once a field has focus.
class KeyboardDismiss extends StatelessWidget {
  final Widget child;
  const KeyboardDismiss({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
      child: child,
    );
  }
}
