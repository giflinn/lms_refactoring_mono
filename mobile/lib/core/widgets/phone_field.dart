import 'package:flutter/material.dart';
import 'package:intl_phone_field/intl_phone_field.dart';
import '../design/tokens.dart';

/// Wrapper around intl_phone_field that mirrors the look of [LabeledTextField].
/// Outputs the canonical E.164 string ('+77081234567') via [onChanged] and
/// reports validity via [onValidityChanged].
class PhoneField extends StatelessWidget {
  final ValueChanged<String> onChanged;
  final ValueChanged<bool> onValidityChanged;
  final String? errorText;
  /// Pre-filled national-only number (no country code), e.g. "7081234567" for
  /// KZ. The country itself is set via [initialCountryCode].
  final String? initialNational;
  final String initialCountryCode;

  const PhoneField({
    super.key,
    required this.onChanged,
    required this.onValidityChanged,
    this.errorText,
    this.initialNational,
    this.initialCountryCode = 'KZ',
  });

  @override
  Widget build(BuildContext context) {
    final hasError = errorText != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 7),
          child: Text(
            'Номер телефона',
            style: TextStyle(
              color: AppColors.labelSecondaryDark.withValues(alpha: 0.6),
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 16 / 13,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppColors.white.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: hasError ? AppColors.redError : Colors.transparent,
              width: 1.5,
            ),
          ),
          child: IntlPhoneField(
            initialCountryCode: initialCountryCode,
            initialValue: initialNational,
            disableLengthCheck: false,
            dropdownTextStyle:
                const TextStyle(color: AppColors.white, fontSize: 17),
            dropdownIcon: Icon(
              Icons.arrow_drop_down,
              color: AppColors.white.withValues(alpha: 0.7),
            ),
            style: const TextStyle(color: AppColors.white, fontSize: 17),
            cursorColor: AppColors.white,
            decoration: InputDecoration(
              isCollapsed: true,
              border: InputBorder.none,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
              counterText: '',
              hintStyle: TextStyle(
                color: AppColors.white.withValues(alpha: 0.4),
              ),
            ),
            // We don't want intl_phone_field's red error text — we render our
            // own underneath in the same style as LabeledTextField.
            invalidNumberMessage: null,
            onChanged: (phone) {
              onChanged(phone.completeNumber);
              // isValidNumber() from intl_phone_field throws NumberTooShortException
              // (and similar) on partial input instead of returning false.
              try {
                onValidityChanged(phone.isValidNumber());
              } catch (_) {
                onValidityChanged(false);
              }
            },
          ),
        ),
        if (hasError)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              errorText!,
              style: const TextStyle(color: AppColors.redError, fontSize: 12),
            ),
          ),
      ],
    );
  }
}
