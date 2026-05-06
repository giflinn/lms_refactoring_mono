import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart';
import '../../../../core/widgets/app_logo.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/keyboard_dismiss.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../../core/widgets/secondary_button.dart';
import '../../data/auth_api.dart';
import '../../domain/validation.dart';
import '../controller/auth_controller.dart';
import '../widgets/otp_field.dart';

/// OTP entry screen shown after sign-up (and after a sign-in attempt that
/// turned out to be unverified). The Firebase user is signed-in but
/// emailVerified=false; submitting the right code marks them verified
/// server-side and the router takes them to /home.
class EmailVerificationPage extends ConsumerStatefulWidget {
  final String email;

  const EmailVerificationPage({super.key, required this.email});

  @override
  ConsumerState<EmailVerificationPage> createState() =>
      _EmailVerificationPageState();
}

class _EmailVerificationPageState
    extends ConsumerState<EmailVerificationPage> {
  final _codeCtrl = TextEditingController();
  String? _error;
  bool _submitting = false;
  bool _resending = false;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    final code = _codeCtrl.text.trim();
    if (!isValidOtp(code)) {
      setState(() => _error = 'Введите 6-значный код');
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref.read(authProvider.notifier).verifyEmailCode(code);
      // Router will redirect to /home once authProvider transitions.
    } on NetworkException {
      if (!mounted) return;
      setState(() => _error = 'Нет соединения с сервером.');
    } on EmailVerificationException catch (e) {
      if (!mounted) return;
      setState(() {
        switch (e.code) {
          case 'wrong_code':
            _error = 'Неверно введен код';
            break;
          case 'too_many_attempts':
            _error = 'Слишком много попыток. Запросите код повторно.';
            break;
          case 'code_expired_or_missing':
            _error = 'Код истёк. Запросите новый.';
            break;
          case 'already_verified':
            // Race: another tab/device already verified. Treat as success.
            _error = null;
            _refreshAndExit();
            return;
          default:
            _error = 'Не удалось проверить код. Попробуйте позже.';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось проверить код. Попробуйте позже.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _refreshAndExit() async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser != null) {
      await fbUser.reload();
      await fb.FirebaseAuth.instance.currentUser?.getIdToken(true);
    }
    // Force authProvider to re-resolve. Easiest: invalidate so it rebuilds.
    ref.invalidate(authProvider);
  }

  Future<void> _resend() async {
    setState(() => _resending = true);
    try {
      await ref.read(authProvider.notifier).resendEmailVerification();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Новый код отправлен')),
      );
    } on EmailVerificationException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.code == 'cooldown'
                ? 'Подождите минуту перед повторной отправкой'
                : 'Не удалось отправить. Попробуйте позже.',
          ),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Не удалось отправить. Попробуйте позже.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  Future<void> _backToLogin() async {
    // Drop the Firebase session so /login starts clean — otherwise the
    // unverified session lingers and the next sign-in attempt repeats the
    // EmailNotVerifiedException without giving the user a chance to switch
    // accounts.
    await fb.FirebaseAuth.instance.signOut();
    if (!mounted) return;
    context.go('/login');
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
              padding: const EdgeInsets.symmetric(
                horizontal: 24,
                vertical: 16,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 32),
                  const Center(child: AppLogo(width: 220)),
                  const SizedBox(height: 32),
                  const Text(
                    'Подтвердите\nemail',
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
                    'Мы отправили код на\n${widget.email}',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.white.withValues(alpha: 0.8),
                      fontSize: 14,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 16),
                  OtpField(
                    controller: _codeCtrl,
                    hasError: _error != null,
                    onChanged: (_) {
                      if (_error != null) setState(() => _error = null);
                    },
                    onCompleted: (_) => _submit(),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4, left: 4),
                      child: Text(
                        _error!,
                        style: const TextStyle(
                          color: AppColors.redError,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),
                  PrimaryButton(
                    label: 'Подтвердить',
                    onPressed: _submit,
                    loading: _submitting,
                  ),
                  const SizedBox(height: 12),
                  SecondaryButton(
                    label: 'Вернуться на экран авторизации',
                    onPressed: _backToLogin,
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: TextButton(
                      onPressed: _resending ? null : _resend,
                      child: Text(
                        _resending
                            ? 'Отправляем...'
                            : 'Запросить код повторно',
                        style: const TextStyle(
                          color: AppColors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
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
