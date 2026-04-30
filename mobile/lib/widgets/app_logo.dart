import 'package:flutter/material.dart';

class AppLogo extends StatelessWidget {
  final double width;
  const AppLogo({super.key, this.width = 250});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/logo_white.png',
      width: width,
      fit: BoxFit.contain,
    );
  }
}
