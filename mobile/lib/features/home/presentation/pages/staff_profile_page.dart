import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../auth/presentation/controller/auth_controller.dart';

/// Staff profile screen — opened from the shell topbar avatar. Shows the
/// signed-in staff member's avatar, full name, and a "Выйти" button. Sign-out
/// triggers the router redirect back to /login.
class StaffProfilePage extends ConsumerWidget {
  const StaffProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).value;
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: true,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: AppColors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: const Text(
            'Профиль',
            style: TextStyle(
              color: AppColors.white,
              fontSize: 17,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.4,
            ),
          ),
        ),
        body: SafeArea(
          top: false,
          child: Center(
            child: user == null
                ? const SizedBox.shrink()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      UserAvatar(
                        avatarUrl: user.avatarUrl,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        size: 98,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${user.firstName} ${user.lastName}'.trim(),
                        style: const TextStyle(
                          color: AppColors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w500,
                          letterSpacing: -0.4,
                        ),
                      ),
                      const SizedBox(height: 16),
                      _SignOutButton(
                        onPressed: () =>
                            ref.read(authProvider.notifier).signOut(),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _SignOutButton extends StatelessWidget {
  final VoidCallback onPressed;
  const _SignOutButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.yellowGradientTop,
            AppColors.yellowGradientBottom,
          ],
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onPressed,
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 26, vertical: 14),
            child: Text(
              'Выйти',
              style: TextStyle(
                color: AppColors.purpleDark,
                fontSize: 15,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.4,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
