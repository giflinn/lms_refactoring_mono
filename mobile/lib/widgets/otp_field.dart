import 'package:flutter/material.dart';
import 'package:pin_code_fields/pin_code_fields.dart';
import '../design/tokens.dart';

class OtpField extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onCompleted;
  final bool hasError;

  const OtpField({
    super.key,
    required this.controller,
    required this.onChanged,
    this.onCompleted,
    this.hasError = false,
  });

  @override
  Widget build(BuildContext context) {
    return PinCodeTextField(
      appContext: context,
      length: 6,
      controller: controller,
      keyboardType: TextInputType.number,
      animationType: AnimationType.fade,
      cursorColor: AppColors.white,
      textStyle: const TextStyle(
        color: AppColors.white,
        fontSize: 22,
        fontWeight: FontWeight.w600,
      ),
      pinTheme: PinTheme(
        shape: PinCodeFieldShape.box,
        borderRadius: BorderRadius.circular(8),
        fieldHeight: 48,
        fieldWidth: 44,
        activeFillColor: AppColors.white.withValues(alpha: 0.1),
        selectedFillColor: AppColors.white.withValues(alpha: 0.15),
        inactiveFillColor: AppColors.white.withValues(alpha: 0.1),
        activeColor:
            hasError ? AppColors.redError : AppColors.white.withValues(alpha: 0.3),
        selectedColor: hasError ? AppColors.redError : AppColors.white,
        inactiveColor:
            hasError ? AppColors.redError : Colors.transparent,
        borderWidth: 1.5,
      ),
      enableActiveFill: true,
      onChanged: onChanged,
      onCompleted: onCompleted,
    );
  }
}
