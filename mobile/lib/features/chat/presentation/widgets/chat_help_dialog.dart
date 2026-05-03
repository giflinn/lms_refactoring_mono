import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/chat_models.dart';

class ChatHelpDialog extends StatelessWidget {
  final SupportInfo info;

  const ChatHelpDialog({super.key, required this.info});

  static Future<void> show(BuildContext context, SupportInfo info) {
    return showDialog<void>(
      context: context,
      builder: (_) => ChatHelpDialog(info: info),
    );
  }

  Future<void> _openWhatsapp() async {
    final cleaned =
        info.whatsapp.replaceAll(RegExp(r'[^0-9+]'), '').replaceAll('+', '');
    if (cleaned.isEmpty) return;
    final uri = Uri.parse('https://wa.me/$cleaned');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppColors.purpleDark,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Чат с менеджером',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              info.hours.isNotEmpty
                  ? 'Менеджеры отвечают в часы работы ${info.hours}.'
                  : 'Менеджеры отвечают в рабочие часы.',
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.85),
                fontSize: 14,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'По всем вопросам также можно писать в WhatsApp${info.whatsapp.isNotEmpty ? ":" : "."}',
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.85),
                fontSize: 14,
                height: 1.4,
              ),
            ),
            if (info.whatsapp.isNotEmpty) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF25D366),
                    foregroundColor: AppColors.white,
                    padding:
                        const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onPressed: _openWhatsapp,
                  icon: const Icon(Icons.message_outlined),
                  label: Text('Написать в WhatsApp ${info.whatsapp}'),
                ),
              ),
            ],
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.white.withValues(alpha: 0.85),
                ),
                child: const Text('Закрыть'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
