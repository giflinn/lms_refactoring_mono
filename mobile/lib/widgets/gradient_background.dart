import 'package:flutter/material.dart';
import '../design/tokens.dart';

class GradientBackground extends StatelessWidget {
  final Widget child;
  const GradientBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.purpleGradientTop,
            AppColors.purpleGradientBottom,
          ],
        ),
      ),
      child: child,
    );
  }
}
