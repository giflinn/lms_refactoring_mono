import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart';
import '../../../../core/widgets/app_logo.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/keyboard_dismiss.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../../core/widgets/success_dialog.dart';
import '../../../../core/widgets/terms_checkbox_row.dart';
import '../../data/auth_api.dart';
import '../../domain/registration_data.dart';
import '../../domain/validation.dart';
import '../controller/auth_controller.dart';
import '../widgets/auth_text_field.dart';
import '../widgets/avatar_picker.dart';
import '../widgets/password_rules_tooltip.dart';
import '../widgets/phone_field.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage> {
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmPasswordCtrl = TextEditingController();
  final _managerCodeCtrl = TextEditingController();
  final _passwordFocus = FocusNode();

  String? _avatarPath;
  String _phone = '';
  bool _phoneValid = false;
  bool _termsAccepted = false;
  bool _showPasswordRules = false;
  bool _submitting = false;

  String? _firstNameError;
  String? _lastNameError;
  String? _emailError;
  String? _phoneError;
  String? _passwordError;
  String? _confirmPasswordError;
  String? _managerCodeError;
  String? _termsError;

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
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmPasswordCtrl.dispose();
    _managerCodeCtrl.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  void _resetErrors() {
    setState(() {
      _firstNameError = null;
      _lastNameError = null;
      _emailError = null;
      _phoneError = null;
      _passwordError = null;
      _confirmPasswordError = null;
      _managerCodeError = null;
      _termsError = null;
    });
  }

  bool _validate() {
    var ok = true;
    setState(() {
      if (_firstNameCtrl.text.trim().isEmpty) {
        _firstNameError = 'Обязательное поле для заполнения';
        ok = false;
      }
      if (_lastNameCtrl.text.trim().isEmpty) {
        _lastNameError = 'Обязательное поле для заполнения';
        ok = false;
      }
      final email = _emailCtrl.text.trim();
      if (email.isEmpty) {
        _emailError = 'Обязательное поле для заполнения';
        ok = false;
      } else if (!isValidEmail(email)) {
        _emailError =
            'Пожалуйста, введите действительный адрес электронной почты';
        ok = false;
      }
      if (!_phoneValid) {
        _phoneError = _phone.isEmpty
            ? 'Обязательное поле для заполнения'
            : 'Неверный формат номера';
        ok = false;
      }
      if (!isValidPassword(_passwordCtrl.text)) {
        _passwordError = 'Пароль не соответствует требованиям';
        ok = false;
      }
      if (_confirmPasswordCtrl.text != _passwordCtrl.text) {
        _confirmPasswordError = 'Пароли не совпадают';
        ok = false;
      }
      final code = _managerCodeCtrl.text.trim();
      if (code.isNotEmpty && !isValidManagerCode(code)) {
        _managerCodeError = 'Код должен содержать 6 цифр';
        ok = false;
      }
      if (!_termsAccepted) {
        _termsError = 'Необходимо принять условия';
        ok = false;
      }
    });
    return ok;
  }

  Future<void> _submit() async {
    _resetErrors();
    if (!_validate()) return;

    setState(() => _submitting = true);
    try {
      final code = _managerCodeCtrl.text.trim();
      await ref.read(authProvider.notifier).signUp(
            RegistrationData(
              email: _emailCtrl.text.trim(),
              password: _passwordCtrl.text,
              firstName: _firstNameCtrl.text.trim(),
              lastName: _lastNameCtrl.text.trim(),
              phone: _phone,
              managerCode: code.isEmpty ? null : code,
              avatarPath: _avatarPath,
              termsAccepted: _termsAccepted,
            ),
          );

      if (!mounted) return;
      await SuccessDialog.show(
        context,
        icon: Icons.mark_email_read_outlined,
        title: 'Подтвердите email',
        message:
            'Мы отправили письмо на ${_emailCtrl.text.trim()}. Перейдите по ссылке из письма и затем войдите в приложение.',
      );
      if (!mounted) return;
      context.pop();
    } on NetworkException {
      if (!mounted) return;
      _showSnack('Нет соединения с сервером. Проверьте интернет.');
    } on fb.FirebaseAuthException catch (e) {
      if (!mounted) return;
      setState(() {
        switch (e.code) {
          case 'email-already-in-use':
            _emailError = 'Этот email уже зарегистрирован. Войдите.';
            break;
          case 'invalid-email':
            _emailError =
                'Пожалуйста, введите действительный адрес электронной почты';
            break;
          case 'weak-password':
            _passwordError = 'Пароль не соответствует требованиям';
            break;
          default:
            _showSnack('Не удалось зарегистрироваться. Попробуйте позже.');
        }
      });
    } on RegistrationException catch (e) {
      if (!mounted) return;
      setState(() {
        switch (e.code) {
          case 'manager_code_not_found':
            _managerCodeError = 'Менеджер с таким кодом не найден';
            break;
          case 'invalid_manager_code_format':
            _managerCodeError = 'Код должен содержать 6 цифр';
            break;
          case 'invalid_phone':
            _phoneError = 'Неверный формат номера';
            break;
          case 'name_required':
            _firstNameError = 'Обязательное поле для заполнения';
            break;
          case 'terms_not_accepted':
            _termsError = 'Необходимо принять условия';
            break;
          default:
            _showSnack('Не удалось завершить регистрацию. Попробуйте позже.');
        }
      });
    } catch (_) {
      if (!mounted) return;
      _showSnack('Не удалось зарегистрироваться. Попробуйте позже.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showSnack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
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
                const SizedBox(height: 8),
                const Center(child: AppLogo(width: 180)),
                const SizedBox(height: 16),
                const Text(
                  'Регистрация',
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 16),
                Center(
                  child: AvatarPicker(
                    imagePath: _avatarPath,
                    onChanged: (p) => setState(() => _avatarPath = p),
                  ),
                ),
                const SizedBox(height: 16),
                AuthTextField(
                  label: 'Имя',
                  controller: _firstNameCtrl,
                  errorText: _firstNameError,
                  autofillHint: AutofillHints.givenName,
                  onChanged: (_) {
                    if (_firstNameError != null) {
                      setState(() => _firstNameError = null);
                    }
                  },
                ),
                const SizedBox(height: 12),
                AuthTextField(
                  label: 'Фамилия',
                  controller: _lastNameCtrl,
                  errorText: _lastNameError,
                  autofillHint: AutofillHints.familyName,
                  onChanged: (_) {
                    if (_lastNameError != null) {
                      setState(() => _lastNameError = null);
                    }
                  },
                ),
                const SizedBox(height: 12),
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
                const SizedBox(height: 12),
                PhoneField(
                  errorText: _phoneError,
                  onChanged: (v) {
                    _phone = v;
                    if (_phoneError != null) {
                      setState(() => _phoneError = null);
                    }
                  },
                  onValidityChanged: (v) => _phoneValid = v,
                ),
                const SizedBox(height: 12),
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
                const SizedBox(height: 12),
                AuthTextField(
                  label: 'Повторите пароль',
                  controller: _confirmPasswordCtrl,
                  errorText: _confirmPasswordError,
                  isPassword: true,
                  autofillHint: AutofillHints.newPassword,
                  onChanged: (_) {
                    if (_confirmPasswordError != null) {
                      setState(() => _confirmPasswordError = null);
                    }
                  },
                ),
                const SizedBox(height: 12),
                AuthTextField(
                  label: 'Код менеджера (необязательно)',
                  controller: _managerCodeCtrl,
                  errorText: _managerCodeError,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  maxLength: 6,
                  onChanged: (_) {
                    if (_managerCodeError != null) {
                      setState(() => _managerCodeError = null);
                    }
                  },
                ),
                const SizedBox(height: 16),
                TermsCheckboxRow(
                  value: _termsAccepted,
                  errorText: _termsError,
                  onChanged: (v) => setState(() {
                    _termsAccepted = v;
                    if (v) _termsError = null;
                  }),
                ),
                const SizedBox(height: 20),
                PrimaryButton(
                  label: 'Зарегистрироваться',
                  onPressed: _submit,
                  loading: _submitting,
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      'Уже есть учетная запись? ',
                      style: TextStyle(color: AppColors.white, fontSize: 14),
                    ),
                    TextButton(
                      onPressed: () => context.pop(),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(0, 0),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text(
                        'Войти',
                        style: TextStyle(
                          color: AppColors.yellowPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
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
