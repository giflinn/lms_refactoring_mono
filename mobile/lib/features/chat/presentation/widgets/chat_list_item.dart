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
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ChatAvatar(user: thread.client, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          thread.client.fullName,
                          style: const TextStyle(
                            color: AppColors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        formatListStamp(thread.lastMessageAt),
                        style: TextStyle(
                          color: AppColors.white.withValues(alpha: 0.6),
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          thread.lastMessagePreview ?? 'Нет сообщений',
                          style: TextStyle(
                            color: AppColors.white.withValues(alpha: 0.7),
                            fontSize: 12,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (thread.unreadCount > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          margin: const EdgeInsets.only(left: 8),
                          decoration: BoxDecoration(
                            color: AppColors.yellowGradientBottom,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            thread.unreadCount > 9
                                ? '9+'
                                : thread.unreadCount.toString(),
                            style: const TextStyle(
                              color: AppColors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                    ],
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
