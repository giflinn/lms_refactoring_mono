import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/design/tokens.dart';

/// "Соглашаюсь с условиями оферты и политикой конфиденциальности" row with
/// the orange-checked box from the design. The two phrases are tappable
/// links to the legal docs.
class TermsCheckboxRow extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  final String? errorText;

  static const _offerUrl = 'https://slyamova.kz/oferta';
  static const _privacyUrl = 'https://slyamova.kz/privacy';

  const TermsCheckboxRow({
    super.key,
    required this.value,
    required this.onChanged,
    this.errorText,
  });

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GestureDetector(
              onTap: () => onChanged(!value),
              behavior: HitTestBehavior.opaque,
              child: Container(
                width: 20,
                height: 20,
                margin: const EdgeInsets.only(top: 2),
                decoration: BoxDecoration(
                  color: value ? AppColors.yellowPrimary : Colors.transparent,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(
                    color: value
                        ? AppColors.yellowPrimary
                        : AppColors.white.withValues(alpha: 0.5),
                    width: 1.5,
                  ),
                ),
                child: value
                    ? const Icon(Icons.check,
                        size: 16, color: AppColors.purpleDark)
                    : null,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: RichText(
                text: TextSpan(
                  style: const TextStyle(
                    color: AppColors.white,
                    fontSize: 13,
                    height: 1.4,
                  ),
                  children: [
                    const TextSpan(text: 'Соглашаюсь с условиями '),
                    TextSpan(
                      text: 'оферты',
                      style: const TextStyle(
                        color: AppColors.yellowPrimary,
                        decoration: TextDecoration.underline,
                      ),
                      recognizer: TapGestureRecognizer()
                        ..onTap = () => _open(_offerUrl),
                    ),
                    const TextSpan(text: ' и '),
                    TextSpan(
                      text: 'политикой конфиденциальности',
                      style: const TextStyle(
                        color: AppColors.yellowPrimary,
                        decoration: TextDecoration.underline,
                      ),
                      recognizer: TapGestureRecognizer()
                        ..onTap = () => _open(_privacyUrl),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        if (errorText != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 30),
            child: Text(
              errorText!,
              style: const TextStyle(color: AppColors.redError, fontSize: 12),
            ),
          ),
      ],
    );
  }
}
