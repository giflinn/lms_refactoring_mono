import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/chat_models.dart';

/// Avatar widget for chat surfaces. Displays the network image when available,
/// falls back to initials over a tinted circle. Wraps the URL resolution that
/// the catalog avatars also do — relative `/avatars/...` paths get prefixed
/// with the API base.
class ChatAvatar extends ConsumerWidget {
  final ChatUserSummary user;
  final double size;

  const ChatAvatar({super.key, required this.user, this.size = 36});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiClientProvider);
    final url = user.avatarUrl;
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
          errorBuilder: (_, _, _) => _Initials(user: user, size: size),
        ),
      );
    }
    return _Initials(user: user, size: size);
  }
}

class _Initials extends StatelessWidget {
  final ChatUserSummary user;
  final double size;

  const _Initials({required this.user, required this.size});

  @override
  Widget build(BuildContext context) {
    final f = user.firstName.isNotEmpty ? user.firstName[0] : '';
    final l = user.lastName.isNotEmpty ? user.lastName[0] : '';
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
