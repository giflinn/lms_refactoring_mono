import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../domain/client.dart';

/// Single row in the staff "Клиенты" list. Avatar + ФИО + phone (or email
/// if no phone), with an optional VIP chip when `clientCategory == 'vip'`.
class ClientTile extends StatelessWidget {
  final Client client;
  final VoidCallback onTap;

  const ClientTile({super.key, required this.client, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final subtitle = (client.phone?.trim().isNotEmpty ?? false)
        ? client.phone!.trim()
        : client.email;
    final isVip = client.clientCategory == 'vip';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              UserAvatar(
                avatarUrl: client.avatarUrl,
                firstName: client.firstName,
                lastName: client.lastName,
                size: 48,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            client.fullName.isEmpty ? '—' : client.fullName,
                            style: const TextStyle(
                              color: AppColors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                              letterSpacing: -0.4,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isVip) ...[
                          const SizedBox(width: 8),
                          const _VipChip(),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: AppColors.white.withValues(alpha: 0.6),
                        fontSize: 13,
                        height: 16 / 13,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right,
                color: AppColors.white.withValues(alpha: 0.6),
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VipChip extends StatelessWidget {
  const _VipChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.yellowGradientTop,
            AppColors.yellowGradientBottom,
          ],
        ),
        borderRadius: BorderRadius.circular(4),
      ),
      child: const Text(
        'VIP',
        style: TextStyle(
          color: AppColors.white,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          height: 14 / 11,
        ),
      ),
    );
  }
}
