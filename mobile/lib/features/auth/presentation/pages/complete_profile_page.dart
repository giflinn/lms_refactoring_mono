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
import '../../data/auth_api.dart';
import '../../domain/registration_data.dart';
import '../../domain/validation.dart';
import '../controller/auth_controller.dart';
import '../widgets/auth_text_field.dart';
import '../widgets/checkbox_row.dart';
import '../widgets/phone_field.dart';

/// Shown after a successful Google sign-in for users who don't yet have a row
/// in our DB. Asks for the few fields Google didn't give us (phone, manager
/// code, terms acceptance). Name fields are prefilled from the Google profile
/// but editable.
class CompleteProfilePage extends ConsumerStatefulWidget {
  final PendingGoogleProfile profile;

  const CompleteProfilePage({super.key, required this.profile});

  @override
  ConsumerState<CompleteProfilePage> createState() =>
      _CompleteProfilePageState();
}

class _CompleteProfilePageState extends ConsumerState<CompleteProfilePage> {
  late final TextEditingController _firstNameCtrl;
  late final TextEditingController _lastNameCtrl;
  final _managerCodeCtrl = TextEditingController();

  String _phone = '';
  bool _phoneValid = false;
  bool _termsAccepted = false;
  bool _submitting = false;

  String? _firstNameError;
  String? _lastNameError;
  String? _phoneError;
  String? _managerCodeError;
  String? _termsError;

  @override
  void initState() {
    super.initState();
    _firstNameCtrl = TextEditingController(text: widget.profile.firstName);
    _lastNameCtrl = TextEditingController(text: widget.profile.lastName);
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _managerCodeCtrl.dispose();
    super.dispose();
  }

  bool _validate() {
    var ok = true;
    setState(() {
      _firstNameError = null;
      _lastNameError = null;
      _phoneError = null;
      _managerCodeError = null;
      _termsError = null;
      if (_firstNameCtrl.text.trim().isEmpty) {
        _firstNameError = 'Обязательное поле для заполнения';
        ok = false;
      }
      if (_lastNameCtrl.text.trim().isEmpty) {
        _lastNameError = 'Обязательное поле для заполнения';
        ok = false;
      }
      if (!_phoneValid) {
        _phoneError = _phone.isEmpty
            ? 'Обязательное поле для заполнения'
            : 'Неверный формат номера';
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
    if (!_validate()) return;
    setState(() => _submitting = true);
    try {
      final code = _managerCodeCtrl.text.trim();
      await ref.read(authProvider.notifier).completeGoogleProfile(
            firstName: _firstNameCtrl.text.trim(),
            lastName: _lastNameCtrl.text.trim(),
            phone: _phone,
            managerCode: code.isEmpty ? null : code,
            termsAccepted: _termsAccepted,
          );
      // Router watches authProvider — once user is set, redirect lands on /home.
    } on NetworkException {
      if (!mounted) return;
      _showSnack('Нет соединения с сервером. Проверьте интернет.');
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
            _showSnack('Не удалось сохранить профиль. Попробуйте позже.');
        }
      });
    } catch (_) {
      if (!mounted) return;
      _showSnack('Не удалось сохранить профиль. Попробуйте позже.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showSnack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<bool> _confirmExit() async {
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.purpleDark,
        title: const Text(
          'Отменить регистрацию?',
          style: TextStyle(color: AppColors.white),
        ),
        content: const Text(
          'Без заполнения профиля вход через Google не будет завершён.',
          style: TextStyle(color: AppColors.white),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Продолжить', style: TextStyle(color: AppColors.yellowPrimary)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Отменить', style: TextStyle(color: AppColors.redError)),
          ),
        ],
      ),
    );
    if (result == true) {
      await ref.read(authProvider.notifier).abandonGoogleSignUp();
      return true;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final shouldExit = await _confirmExit();
        if (!context.mounted) return;
        if (shouldExit) {
          // The user confirmed they want to abandon Google sign-up. The
          // controller revoked the firebase user, so authProvider will go to
          // null and the router redirect will land on /login.
          context.go('/login');
        }
      },
      child: GradientBackground(
        child: Scaffold(
          backgroundColor: Colors.transparent,
          resizeToAvoidBottomInset: true,
          body: KeyboardDismiss(
            child: SafeArea(
              child: SingleChildScrollView(
              padding:
                  const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 16),
                  const Center(child: AppLogo(width: 180)),
                  const SizedBox(height: 16),
                  const Text(
                    'Завершите регистрацию',
                    style: TextStyle(
                      color: AppColors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Несколько данных, которые Google не передал.',
                    style: TextStyle(
                      color: AppColors.white.withValues(alpha: 0.8),
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 20),
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
                  const SizedBox(height: 24),
                  PrimaryButton(
                    label: 'Завершить регистрацию',
                    onPressed: _submit,
                    loading: _submitting,
                  ),
                  const SizedBox(height: 16),
                ],
              ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
