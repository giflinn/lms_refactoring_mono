import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../design/tokens.dart';
import '../network/api_provider.dart';

/// Circular avatar for any user. Resolves relative `/avatars/...` URLs against
/// the API base; falls back to initials over a tinted circle when the URL is
/// missing or fails to load. Generic across features — pass in the URL +
/// first/last name directly rather than a feature-specific user model.
class UserAvatar extends ConsumerWidget {
  final String? avatarUrl;
  final String firstName;
  final String lastName;
  final double size;

  const UserAvatar({
    super.key,
    required this.avatarUrl,
    required this.firstName,
    required this.lastName,
    this.size = 38,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiClientProvider);
    final url = avatarUrl;
    final resolved = url == null || url.isEmpty
        ? null
        : url.startsWith('http')
            ? url
            : '${api.baseUrl}$url';
    if (resolved != null) {
      return ClipOval(
        child: Image.network(
          resolved,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _Initials(
            firstName: firstName,
            lastName: lastName,
            size: size,
          ),
        ),
      );
    }
    return _Initials(
      firstName: firstName,
      lastName: lastName,
      size: size,
    );
  }
}

class _Initials extends StatelessWidget {
  final String firstName;
  final String lastName;
  final double size;

  const _Initials({
    required this.firstName,
    required this.lastName,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    final f = firstName.isNotEmpty ? firstName[0] : '';
    final l = lastName.isNotEmpty ? lastName[0] : '';
    final initials = (f + l).toUpperCase();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: AppColors.purpleTertiary,
        shape: BoxShape.circle,
      ),
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: TextStyle(
          color: AppColors.white,
          fontWeight: FontWeight.w600,
          fontSize: size * 0.4,
        ),
      ),
    );
  }
}
