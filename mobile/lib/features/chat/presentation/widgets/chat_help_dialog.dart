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
      barrierColor: Colors.black.withValues(alpha: 0.4),
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
    final body = info.hours.isNotEmpty
        ? 'Менеджеры отвечают в часы работы ${info.hours}. Для срочных вопросов — WhatsApp.'
        : 'Менеджеры отвечают в рабочие часы. Для срочных вопросов — WhatsApp.';
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 40),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 24, 12, 12),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.purpleGradientTop,
              AppColors.purplePrimary,
            ],
          ),
          borderRadius: BorderRadius.all(Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(
              'assets/icons/chat/help.png',
              width: 50,
              height: 50,
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: 252,
              child: Text(
                body,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                  letterSpacing: -0.4,
                ),
              ),
            ),
            const SizedBox(height: 24),
            if (info.whatsapp.isNotEmpty)
              _YellowButton(
                label: 'Написать в WhatsApp',
                onTap: () {
                  Navigator.of(context).pop();
                  _openWhatsapp();
                },
              ),
            if (info.whatsapp.isNotEmpty) const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text(
                  'Закрыть',
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _YellowButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _YellowButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      width: double.infinity,
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.yellowGradientTop,
                AppColors.yellowGradientBottom,
              ],
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Center(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: AppColors.purpleDark,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
