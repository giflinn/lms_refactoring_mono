import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/design/tokens.dart';
import '../../data/chat_api.dart';
import '../../data/chat_api_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/chat_format.dart';
import '../../domain/chat_models.dart';

enum BubbleSide { left, right, center }

/// Single chat bubble. Designed to match the Figma mobile chat screens —
/// yellow on the receiving side (manager → client / client → staff) and
/// purple on the sending side. System messages render centered as small grey
/// labels.
class MessageBubble extends ConsumerWidget {
  final ChatMessage message;
  final BubbleSide side;

  /// Optional sender label rendered above the bubble. The page passes a name
  /// only on the first message in a consecutive run from the same sender,
  /// so chats with multiple staff (e.g. senior manager joining a thread)
  /// stay attributable without putting a tag on every bubble.
  final String? senderLabel;

  const MessageBubble({
    super.key,
    required this.message,
    required this.side,
    this.senderLabel,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(chatApiProvider);
    if (message.isSystem || side == BubbleSide.center) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Text(
            message.body ?? '',
            style: TextStyle(
              fontSize: 11,
              color: AppColors.white.withValues(alpha: 0.6),
              fontStyle: FontStyle.italic,
            ),
          ),
        ),
      );
    }
    final isRight = side == BubbleSide.right;
    final bg = isRight ? AppColors.purpleDark : AppColors.yellowGradientTop;
    final fg = isRight ? AppColors.white : Colors.black87;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: isRight
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          if (senderLabel != null && senderLabel!.isNotEmpty)
            Padding(
              padding: EdgeInsets.only(
                left: isRight ? 0 : 8,
                right: isRight ? 8 : 0,
                bottom: 2,
              ),
              child: Text(
                senderLabel!,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: AppColors.white.withValues(alpha: 0.75),
                ),
              ),
            ),
          Row(
            mainAxisAlignment: isRight
                ? MainAxisAlignment.end
                : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.of(context).size.width * 0.72,
                ),
                child: Container(
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(14),
                      topRight: const Radius.circular(14),
                      bottomLeft: Radius.circular(isRight ? 14 : 4),
                      bottomRight: Radius.circular(isRight ? 4 : 14),
                    ),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final a in message.attachments)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: _AttachmentTile(
                            attachment: a,
                            api: api,
                            onRight: isRight,
                          ),
                        ),
                      if (message.body != null && message.body!.isNotEmpty)
                        Text(
                          message.body!,
                          style: TextStyle(fontSize: 14, color: fg),
                        ),
                      const SizedBox(height: 2),
                      Align(
                        alignment: Alignment.bottomRight,
                        child: Text(
                          formatTime(message.createdAt),
                          style: TextStyle(
                            fontSize: 10,
                            color: fg.withValues(alpha: 0.7),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AttachmentTile extends StatelessWidget {
  final ChatAttachment attachment;
  final ChatApi api;
  final bool onRight;

  const _AttachmentTile({
    required this.attachment,
    required this.api,
    required this.onRight,
  });

  Future<void> _openExternal() async {
    final uri = Uri.parse(api.resolveFileUrl(attachment.url));
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _openImage(BuildContext context) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black,
      useSafeArea: false,
      builder: (_) =>
          _FullscreenImageViewer(url: api.resolveFileUrl(attachment.url)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (attachment.isImage) {
      return GestureDetector(
        onTap: () => _openImage(context),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            api.resolveFileUrl(attachment.url),
            fit: BoxFit.cover,
            width: 220,
            height: 160,
            errorBuilder: (_, _, _) => Container(
              width: 220,
              height: 160,
              color: Colors.black26,
              child: const Icon(
                Icons.broken_image_outlined,
                color: Colors.white70,
              ),
            ),
          ),
        ),
      );
    }
    final fg = onRight ? Colors.white : Colors.black87;
    return InkWell(
      onTap: _openExternal,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: onRight
              ? Colors.white.withValues(alpha: 0.15)
              : Colors.black.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.description_outlined, color: fg, size: 18),
            const SizedBox(width: 6),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    attachment.name,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: fg),
                  ),
                  Text(
                    formatFileSize(attachment.size),
                    style: TextStyle(
                      fontSize: 10,
                      color: fg.withValues(alpha: 0.7),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FullscreenImageViewer extends StatelessWidget {
  final String url;

  const _FullscreenImageViewer({required this.url});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: InteractiveViewer(
                  minScale: 1.0,
                  maxScale: 5.0,
                  child: Center(
                    child: Image.network(
                      url,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.broken_image_outlined,
                        color: Colors.white70,
                        size: 64,
                      ),
                      loadingBuilder: (_, child, progress) {
                        if (progress == null) return child;
                        return const SizedBox(
                          width: 32,
                          height: 32,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white70,
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: Material(
                color: Colors.black.withValues(alpha: 0.4),
                shape: const CircleBorder(),
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
