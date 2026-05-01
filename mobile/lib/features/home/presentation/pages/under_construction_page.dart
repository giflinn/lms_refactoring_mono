import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';

class UnderConstructionPage extends StatelessWidget {
  final String title;
  const UnderConstructionPage({super.key, required this.title});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.construction_outlined,
            size: 64,
            color: AppColors.white.withValues(alpha: 0.7),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 22,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'В разработке',
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.7),
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }
}
