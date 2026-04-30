import 'package:flutter/material.dart';
import '../design/tokens.dart';

class AuthTextField extends StatefulWidget {
  final String label;
  final TextEditingController controller;
  final String? errorText;
  final bool isPassword;
  final TextInputType? keyboardType;
  final String? autofillHint;
  final ValueChanged<String>? onChanged;

  const AuthTextField({
    super.key,
    required this.label,
    required this.controller,
    this.errorText,
    this.isPassword = false,
    this.keyboardType,
    this.autofillHint,
    this.onChanged,
  });

  @override
  State<AuthTextField> createState() => _AuthTextFieldState();
}

class _AuthTextFieldState extends State<AuthTextField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    final hasError = widget.errorText != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 7),
          child: Text(
            widget.label,
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
          child: TextField(
            controller: widget.controller,
            obscureText: widget.isPassword && _obscure,
            keyboardType: widget.keyboardType,
            autofillHints:
                widget.autofillHint != null ? [widget.autofillHint!] : null,
            onChanged: widget.onChanged,
            style: const TextStyle(color: AppColors.white, fontSize: 17),
            cursorColor: AppColors.white,
            decoration: InputDecoration(
              isCollapsed: true,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 13,
              ),
              suffixIcon: widget.isPassword
                  ? IconButton(
                      onPressed: () => setState(() => _obscure = !_obscure),
                      icon: ColorFiltered(
                        colorFilter: ColorFilter.mode(
                          AppColors.white.withValues(alpha: 0.6),
                          BlendMode.srcIn,
                        ),
                        child: Image.asset(
                          _obscure
                              ? 'assets/eye_closed.png'
                              : 'assets/eye_open.png',
                          width: 22,
                          height: 22,
                        ),
                      ),
                    )
                  : null,
            ),
          ),
        ),
        if (hasError)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              widget.errorText!,
              style: const TextStyle(
                color: AppColors.redError,
                fontSize: 12,
              ),
            ),
          ),
      ],
    );
  }
}
