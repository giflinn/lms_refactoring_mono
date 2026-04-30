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
import '../widgets/primary_button.dart';
import '../widgets/secondary_button.dart';
import 'forgot_password_code_page.dart';

class ForgotPasswordEmailPage extends ConsumerStatefulWidget {
  const ForgotPasswordEmailPage({super.key});

  @override
  ConsumerState<ForgotPasswordEmailPage> createState() =>
      _ForgotPasswordEmailPageState();
}

class _ForgotPasswordEmailPageState
    extends ConsumerState<ForgotPasswordEmailPage> {
  final _emailCtrl = TextEditingController();
  String? _emailError;
  bool _submitting = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _emailError = null);
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      setState(() => _emailError = 'Не введен email');
      return;
    }
    if (!isValidEmail(email)) {
      setState(() => _emailError = 'Неверно введен имейл');
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref.read(authProvider.notifier).requestPasswordReset(email);
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ForgotPasswordCodePage(email: email),
        ),
      );
    } on NetworkException {
      if (!mounted) return;
      setState(() =>
          _emailError = 'Нет соединения с сервером. Проверьте интернет.');
    } on PasswordResetException catch (e) {
      if (!mounted) return;
      setState(() {
        switch (e.code) {
          case 'cooldown':
            _emailError = 'Подождите минуту перед повторной отправкой';
            break;
          case 'too_many_requests':
            _emailError = 'Слишком много запросов. Попробуйте позже.';
            break;
          default:
            _emailError = 'Не удалось отправить. Попробуйте позже.';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _emailError = 'Не удалось отправить. Попробуйте позже.');
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
                const SizedBox(height: 32),
                const Center(child: AppLogo(width: 220)),
                const SizedBox(height: 32),
                const Text(
                  'Восстановление\nпароля',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w600,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Мы вышлем Вам инструкции по\nвосстановлению пароля\nна электронную почту.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.8),
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 24),
                AuthTextField(
                  label: 'Электронная почта',
                  controller: _emailCtrl,
                  errorText: _emailError,
                  keyboardType: TextInputType.emailAddress,
                  autofillHint: AutofillHints.email,
                  onChanged: (_) {
                    if (_emailError != null) {
                      setState(() => _emailError = null);
                    }
                  },
                ),
                const SizedBox(height: 16),
                PrimaryButton(
                  label: 'Отправить инструкцию',
                  onPressed: _submit,
                  loading: _submitting,
                ),
                const SizedBox(height: 12),
                SecondaryButton(
                  label: 'Вернуться на экран авторизации',
                  onPressed: () => Navigator.of(context).pop(),
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
