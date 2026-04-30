import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_api.dart';
import '../auth/auth_controller.dart';
import '../auth/validation.dart';
import '../design/tokens.dart';
import '../widgets/app_logo.dart';
import '../widgets/auth_text_field.dart';
import '../widgets/gradient_background.dart';
import '../widgets/keyboard_dismiss.dart';
import '../widgets/password_rules_tooltip.dart';
import '../widgets/primary_button.dart';
import '../widgets/success_dialog.dart';

class ForgotPasswordNewPwdPage extends ConsumerStatefulWidget {
  final String resetToken;

  const ForgotPasswordNewPwdPage({super.key, required this.resetToken});

  @override
  ConsumerState<ForgotPasswordNewPwdPage> createState() =>
      _ForgotPasswordNewPwdPageState();
}

class _ForgotPasswordNewPwdPageState
    extends ConsumerState<ForgotPasswordNewPwdPage> {
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  final _passwordFocus = FocusNode();
  String? _passwordError;
  String? _confirmError;
  bool _showPasswordRules = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _passwordFocus.addListener(() {
      if (_passwordFocus.hasFocus) {
        setState(() => _showPasswordRules = true);
      }
    });
  }

  @override
  void dispose() {
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _passwordError = null;
      _confirmError = null;
    });

    if (!isValidPassword(_passwordCtrl.text)) {
      setState(() => _passwordError = 'Пароль не соответствует требованиям');
      return;
    }
    if (_confirmCtrl.text != _passwordCtrl.text) {
      setState(() => _confirmError = 'Пароли не совпадают');
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref.read(authProvider.notifier).completePasswordReset(
            resetToken: widget.resetToken,
            newPassword: _passwordCtrl.text,
          );
      if (!mounted) return;
      // Pop the new-password screen first so the dialog overlays the login page
      // (matching the Figma success state).
      Navigator.of(context).popUntil((r) => r.isFirst);
      if (!mounted) return;
      await SuccessDialog.show(
        context,
        icon: Icons.lock_outline,
        title: 'Пароль успешно изменен',
        message: 'Теперь вы можете войти используя новый пароль.',
      );
    } on NetworkException {
      if (!mounted) return;
      setState(() => _confirmError = 'Нет соединения с сервером.');
    } on PasswordResetException catch (e) {
      if (!mounted) return;
      setState(() {
        switch (e.code) {
          case 'weak_password':
            _passwordError = 'Пароль не соответствует требованиям';
            break;
          case 'invalid_or_expired_token':
            _confirmError = 'Сессия истекла. Начните сначала.';
            break;
          default:
            _confirmError = 'Не удалось изменить пароль. Попробуйте позже.';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _confirmError =
          'Не удалось изменить пароль. Попробуйте позже.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        resizeToAvoidBottomInset: true,
        body: KeyboardDismiss(
          child: SafeArea(
            child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 24),
                const Center(child: AppLogo(width: 200)),
                const SizedBox(height: 32),
                const Text(
                  'Новый пароль',
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 24),
                AuthTextField(
                  label: 'Пароль',
                  controller: _passwordCtrl,
                  errorText: _passwordError,
                  isPassword: true,
                  focusNode: _passwordFocus,
                  autofillHint: AutofillHints.newPassword,
                  onChanged: (_) {
                    if (_passwordError != null) {
                      setState(() => _passwordError = null);
                    }
                  },
                ),
                if (_showPasswordRules) ...[
                  const SizedBox(height: 8),
                  PasswordRulesTooltip(
                    onClose: () => setState(() => _showPasswordRules = false),
                  ),
                ],
                const SizedBox(height: 16),
                AuthTextField(
                  label: 'Повторите пароль',
                  controller: _confirmCtrl,
                  errorText: _confirmError,
                  isPassword: true,
                  autofillHint: AutofillHints.newPassword,
                  onChanged: (_) {
                    if (_confirmError != null) {
                      setState(() => _confirmError = null);
                    }
                  },
                ),
                const SizedBox(height: 24),
                PrimaryButton(
                  label: 'Подтвердить',
                  onPressed: _submit,
                  loading: _submitting,
                ),
              ],
            ),
            ),
          ),
        ),
      ),
    );
  }
}
