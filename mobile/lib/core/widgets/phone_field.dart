import 'package:flutter/material.dart';
import 'package:phone_form_field/phone_form_field.dart';
import '../design/tokens.dart';

/// Wrapper around [PhoneFormField] (libphonenumber under the hood) that
/// matches the dark purple LabeledTextField look. Applies country-specific
/// masks while typing (e.g. KZ shows "+7 700 123 45 67"). Outputs the
/// canonical E.164 string ('+77001234567') via [onChanged] and reports
/// validity via [onValidityChanged]. The country picker is opened in a
/// bottom sheet with a search field — selecting a country swaps the dial
/// code, the mask, and the validation rules in one go.
class PhoneField extends StatefulWidget {
  final ValueChanged<String> onChanged;
  final ValueChanged<bool> onValidityChanged;
  final String? errorText;

  /// Pre-filled E.164 phone (e.g. "+77081234567") or null/empty for a blank
  /// field. The country is auto-detected from the dial code prefix; if
  /// parsing fails we fall back to [initialCountry].
  final String? initialPhone;
  final IsoCode initialCountry;

  const PhoneField({
    super.key,
    required this.onChanged,
    required this.onValidityChanged,
    this.errorText,
    this.initialPhone,
    this.initialCountry = IsoCode.KZ,
  });

  @override
  State<PhoneField> createState() => _PhoneFieldState();
}

class _PhoneFieldState extends State<PhoneField> {
  late final PhoneNumber _initialValue;

  @override
  void initState() {
    super.initState();
    final raw = widget.initialPhone?.trim();
    PhoneNumber? parsed;
    if (raw != null && raw.isNotEmpty) {
      try {
        parsed = PhoneNumber.parse(raw);
      } catch (_) {
        parsed = null;
      }
    }
    _initialValue =
        parsed ?? PhoneNumber(isoCode: widget.initialCountry, nsn: '');
  }

  @override
  Widget build(BuildContext context) {
    final hasError = widget.errorText != null;
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
          child: PhoneFormField(
            initialValue: _initialValue,
            countrySelectorNavigator:
                const CountrySelectorNavigator.bottomSheet(),
            countryButtonStyle: const CountryButtonStyle(
              showDialCode: true,
              showIsoCode: false,
              showFlag: true,
              flagSize: 20,
              textStyle: TextStyle(color: AppColors.white, fontSize: 17),
            ),
            style: const TextStyle(color: AppColors.white, fontSize: 17),
            cursorColor: AppColors.white,
            decoration: const InputDecoration(
              border: InputBorder.none,
              contentPadding:
                  EdgeInsets.symmetric(horizontal: 12, vertical: 13),
            ),
            onChanged: (phone) {
              final hasNsn = phone.nsn.isNotEmpty;
              widget.onChanged(hasNsn ? phone.international : '');
              widget.onValidityChanged(hasNsn && phone.isValid());
            },
          ),
        ),
        if (hasError)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              widget.errorText!,
              style: const TextStyle(color: AppColors.redError, fontSize: 12),
            ),
          ),
      ],
    );
  }
}
