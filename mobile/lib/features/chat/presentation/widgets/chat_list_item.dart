import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/chat_format.dart';
import '../../domain/chat_models.dart';
import 'chat_avatar.dart';

class ChatListItem extends StatelessWidget {
  final ChatThread thread;
  final VoidCallback onTap;

  const ChatListItem({
    super.key,
    required this.thread,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final hasUnread = thread.unreadCount > 0;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.only(top: 8, left: 16, right: 16),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ChatAvatar(user: thread.client, size: 48),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.only(bottom: 8),
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: Color(0x33FFFFFF),
                        width: 0.5,
                      ),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(right: 16),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                thread.client.fullName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: AppColors.white,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w500,
                                  letterSpacing: -0.4,
                                  height: 1.3,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                thread.lastMessagePreview ?? 'Нет сообщений',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: AppColors.purpleTertiary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  height: 1.2,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Column(
                          mainAxisAlignment: hasUnread
                              ? MainAxisAlignment.spaceBetween
                              : MainAxisAlignment.start,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              formatListStamp(thread.lastMessageAt),
                              maxLines: 1,
                              softWrap: false,
                              overflow: TextOverflow.clip,
                              textAlign: TextAlign.right,
                              style: const TextStyle(
                                color: AppColors.purpleTertiary,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                height: 16 / 13,
                              ),
                            ),
                            if (hasUnread) _UnreadBadge(count: thread.unreadCount),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  final int count;
  const _UnreadBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    final label = count > 99 ? '99+' : count.toString();
    return Container(
      height: 24,
      constraints: const BoxConstraints(minWidth: 24),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.yellowPrimary,
        borderRadius: BorderRadius.circular(1000),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.purpleDark,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
