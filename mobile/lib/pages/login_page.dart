import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../auth/auth_api.dart';
import '../auth/auth_controller.dart';
import '../auth/validation.dart';
import '../design/tokens.dart';
import '../widgets/app_logo.dart';
import '../widgets/auth_text_field.dart';
import '../widgets/gradient_background.dart';
import '../widgets/keyboard_dismiss.dart';
import '../widgets/primary_button.dart';
import '../widgets/social_button.dart';
import 'complete_profile_page.dart';
import 'forgot_password_email_page.dart';
import 'register_page.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  String? _emailError;
  String? _passwordError;
  bool _submitting = false;
  bool _showResendVerification = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  void _showInDevelopmentSnackbar() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('В разработке'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  Future<void> _signInWithGoogle() async {
    try {
      final result =
          await ref.read(authProvider.notifier).signInWithGoogle();
      if (!mounted) return;
      switch (result) {
        case GoogleSignInLoggedIn():
          // App watches authProvider — home page takes over.
          break;
        case GoogleSignInNeedsProfile(:final profile):
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => CompleteProfilePage(profile: profile),
            ),
          );
        case GoogleSignInCancelled():
          // User backed out of the Google picker — nothing to do.
          break;
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Не удалось войти через Google. Попробуйте позже.')),
      );
    }
  }

  Future<void> _submit() async {
    setState(() {
      _emailError = null;
      _passwordError = null;
      _showResendVerification = false;
    });

    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;

    if (email.isEmpty) {
      setState(() => _emailError = 'Не введен email');
      return;
    }
    if (!isValidEmail(email)) {
      setState(() => _emailError =
          'Пожалуйста, введите действительный адрес электронной почты');
      return;
    }
    if (password.isEmpty) {
      setState(() => _passwordError = 'Не введен пароль');
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref.read(authProvider.notifier).signIn(email, password);
    } on NetworkException {
      if (!mounted) return;
      setState(() =>
          _passwordError = 'Нет соединения с сервером. Проверьте интернет.');
    } on EmailNotVerifiedException {
      if (!mounted) return;
      setState(() {
        _passwordError =
            'Email не подтвержден. Перейдите по ссылке из письма.';
        _showResendVerification = true;
      });
    } on fb.FirebaseAuthException catch (e) {
      if (!mounted) return;
      setState(() {
        switch (e.code) {
          case 'invalid-email':
            _emailError =
                'Пожалуйста, введите действительный адрес электронной почты';
            break;
          case 'user-not-found':
            _emailError = 'Имейл не зарегистрирован';
            break;
          case 'wrong-password':
          case 'invalid-credential':
            _passwordError = 'Неверно введен пароль';
            break;
          case 'too-many-requests':
            _passwordError = 'Слишком много попыток. Попробуйте позже.';
            break;
          default:
            _passwordError = 'Не удалось войти. Попробуйте позже.';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(
          () => _passwordError = 'Не удалось войти. Попробуйте позже.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _resendVerification() async {
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (email.isEmpty || password.isEmpty) return;
    try {
      await ref.read(authProvider.notifier).resendVerification(email, password);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Письмо отправлено повторно на $email')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Не удалось отправить. Попробуйте позже.')),
      );
    }
  }

  void _goToRegister() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const RegisterPage()),
    );
  }

  void _goToForgotPassword() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const ForgotPasswordEmailPage()),
    );
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
                const SizedBox(height: 16),
                const Center(child: AppLogo(width: 220)),
                const SizedBox(height: 24),
                const Text(
                  'Добро пожаловать!',
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w600,
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
                AuthTextField(
                  label: 'Пароль',
                  controller: _passwordCtrl,
                  errorText: _passwordError,
                  isPassword: true,
                  autofillHint: AutofillHints.password,
                  onChanged: (_) {
                    if (_passwordError != null) {
                      setState(() {
                        _passwordError = null;
                        _showResendVerification = false;
                      });
                    }
                  },
                ),
                if (_showResendVerification)
                  Padding(
                    padding: const EdgeInsets.only(top: 6, left: 4),
                    child: GestureDetector(
                      onTap: _resendVerification,
                      child: const Text(
                        'Отправить письмо повторно',
                        style: TextStyle(
                          color: AppColors.yellowPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 24),
                PrimaryButton(
                  label: 'Войти',
                  onPressed: _submit,
                  loading: _submitting,
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: Divider(
                        color: AppColors.white.withValues(alpha: 0.3),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        'или',
                        style: TextStyle(
                          color: AppColors.white.withValues(alpha: 0.7),
                          fontSize: 13,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Divider(
                        color: AppColors.white.withValues(alpha: 0.3),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SocialButton(
                  icon: FontAwesomeIcons.google,
                  label: 'Продолжить с Google',
                  onPressed: _signInWithGoogle,
                ),
                const SizedBox(height: 8),
                SocialButton(
                  icon: FontAwesomeIcons.apple,
                  label: 'Продолжить с Apple',
                  onPressed: _showInDevelopmentSnackbar,
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton(
                      onPressed: _goToRegister,
                      child: const Text(
                        'Регистрация',
                        style: TextStyle(
                          color: AppColors.yellowPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _goToForgotPassword,
                      child: const Text(
                        'Забыли пароль?',
                        style: TextStyle(
                          color: AppColors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
            ),
            ),
          ),
        ),
      ),
    );
  }
}
