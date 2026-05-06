import 'dart:io' show Platform;
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/log.dart';
import '../../../../core/network/api_exceptions.dart';
import '../../../../core/widgets/app_logo.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/keyboard_dismiss.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../domain/validation.dart';
import '../controller/auth_controller.dart';
import '../../../../core/widgets/labeled_text_field.dart';
import '../widgets/social_button.dart';

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
    // The post-Google navigation can otherwise leave the soft keyboard open
    // when /complete-profile or /home mounts — the focused field on this
    // screen lingers across the route change. Drop focus before the
    // OAuth flow starts so there's nothing to keep the keyboard alive.
    FocusManager.instance.primaryFocus?.unfocus();
    try {
      final result = await ref.read(authProvider.notifier).signInWithGoogle();
      if (!mounted) return;
      switch (result) {
        case GoogleSignInLoggedIn():
          // Router watches authProvider — redirect takes us to /home.
          break;
        case GoogleSignInNeedsProfile(:final profile):
          context.push('/complete-profile', extra: profile);
        case GoogleSignInCancelled():
          // User backed out of the Google picker — nothing to do.
          break;
      }
    } catch (e, st) {
      logd('signInWithGoogle failed', e, st);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Не удалось войти через Google. Попробуйте позже.'),
        ),
      );
    }
  }

  Future<void> _submit() async {
    setState(() {
      _emailError = null;
      _passwordError = null;
    });

    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;

    if (email.isEmpty) {
      setState(() => _emailError = 'Не введен email');
      return;
    }
    if (!isValidEmail(email)) {
      setState(
        () => _emailError =
            'Пожалуйста, введите действительный адрес электронной почты',
      );
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
      setState(
        () => _passwordError = 'Нет соединения с сервером. Проверьте интернет.',
      );
    } on EmailNotVerifiedException {
      if (!mounted) return;
      // Firebase session stays open (signIn doesn't sign out for unverified
      // users) — the OTP page calls /auth/email-verification/* with the live
      // ID token. User taps "Запросить код повторно" there if they need a
      // fresh code.
      context.push('/email-verification', extra: email);
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
      setState(() => _passwordError = 'Не удалось войти. Попробуйте позже.');
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
                  LabeledTextField(
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
                  LabeledTextField(
                    label: 'Пароль',
                    controller: _passwordCtrl,
                    errorText: _passwordError,
                    isPassword: true,
                    autofillHint: AutofillHints.password,
                    onChanged: (_) {
                      if (_passwordError != null) {
                        setState(() => _passwordError = null);
                      }
                    },
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
                  // Apple sign-in is iOS-only — Apple's review guidelines
                  // require it alongside other social providers on iOS, but
                  // there's no equivalent rule (or native flow) on Android.
                  if (Platform.isIOS) ...[
                    const SizedBox(height: 8),
                    SocialButton(
                      icon: FontAwesomeIcons.apple,
                      label: 'Продолжить с Apple',
                      onPressed: _showInDevelopmentSnackbar,
                    ),
                  ],
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      TextButton(
                        onPressed: () => context.push('/register'),
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
                        onPressed: () => context.push('/forgot-password'),
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
