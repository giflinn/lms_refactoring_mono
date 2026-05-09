import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../design/tokens.dart';

/// "Соглашаюсь с условиями использования, офертой и политикой
/// конфиденциальности" row with the orange-checked box from the design.
/// All three phrases are tappable links that open the corresponding
/// `/legal/:slug` page in-app — avoiding the external-browser hop the
/// previous implementation did via url_launcher.
class TermsCheckboxRow extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  final String? errorText;

  const TermsCheckboxRow({
    super.key,
    required this.value,
    required this.onChanged,
    this.errorText,
  });

  @override
  Widget build(BuildContext context) {
    final linkStyle = const TextStyle(
      color: AppColors.yellowPrimary,
      decoration: TextDecoration.underline,
    );
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
                    ? const Icon(
                        Icons.check,
                        size: 16,
                        color: AppColors.purpleDark,
                      )
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
                    const TextSpan(text: 'Соглашаюсь с '),
                    TextSpan(
                      text: 'условиями использования',
                      style: linkStyle,
                      recognizer: TapGestureRecognizer()
                        ..onTap = () => _open(context, 'terms'),
                    ),
                    const TextSpan(text: ', '),
                    TextSpan(
                      text: 'офертой',
                      style: linkStyle,
                      recognizer: TapGestureRecognizer()
                        ..onTap = () => _open(context, 'offer'),
                    ),
                    const TextSpan(text: ' и '),
                    TextSpan(
                      text: 'политикой конфиденциальности',
                      style: linkStyle,
                      recognizer: TapGestureRecognizer()
                        ..onTap = () => _open(context, 'privacy'),
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

  void _open(BuildContext context, String slug) {
    context.push('/legal/$slug');
  }
}
