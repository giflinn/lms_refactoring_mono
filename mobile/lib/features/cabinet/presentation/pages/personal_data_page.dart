import 'dart:io';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/domain/app_user.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../../core/widgets/action_dialog.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/labeled_text_field.dart';
import '../../../../core/widgets/phone_field.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../auth/domain/validation.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../data/profile_api.dart';
import '../../data/profile_api_provider.dart';

/// "Личные данные" — client edits firstName / lastName / birthDate / phone /
/// avatar. Email is read-only (Firebase owns it; changing it is a separate
/// re-auth + verify flow that we haven't built yet). The "Готово" button is
/// disabled until the form is dirty AND valid; back press with unsaved
/// changes prompts a confirm dialog.
class PersonalDataPage extends ConsumerStatefulWidget {
  const PersonalDataPage({super.key});

  @override
  ConsumerState<PersonalDataPage> createState() => _PersonalDataPageState();
}

class _PersonalDataPageState extends ConsumerState<PersonalDataPage> {
  late AppUser _initial;
  late TextEditingController _firstName;
  late TextEditingController _lastName;
  late String _phoneE164;
  late bool _phoneValid;
  late String _initialPhoneNational;
  DateTime? _birthDate;
  String? _avatarLocalPath;

  String? _firstNameError;
  String? _lastNameError;
  String? _phoneError;
  String? _birthDateError;

  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _initial = ref.read(authProvider).requireValue!;
    _firstName = TextEditingController(text: _initial.firstName)
      ..addListener(_rebuild);
    _lastName = TextEditingController(text: _initial.lastName)
      ..addListener(_rebuild);
    _phoneE164 = _initial.phone ?? '';
    _phoneValid = _initial.phone == null || isValidPhone(_initial.phone!);
    _initialPhoneNational = _splitNational(_initial.phone);
    _birthDate = _parseIsoDate(_initial.birthDate);
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  // E.164 like "+77081234567" → "7081234567" (national digits only) when KZ.
  // Returns "" for non-KZ or malformed numbers; caller falls back to a blank
  // field with the default country code.
  static String _splitNational(String? e164) {
    if (e164 == null || !e164.startsWith('+7') || e164.length != 12) return '';
    return e164.substring(2);
  }

  static DateTime? _parseIsoDate(String? iso) {
    if (iso == null || iso.isEmpty) return null;
    return DateTime.tryParse(iso);
  }

  static String _formatBirthIso(DateTime? d) {
    if (d == null) return '';
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }

  static String _formatBirthDisplay(DateTime? d) {
    if (d == null) return '';
    final day = d.day.toString().padLeft(2, '0');
    final m = d.month.toString().padLeft(2, '0');
    return '$day.$m.${d.year}';
  }

  bool get _isDirty {
    if (_firstName.text.trim() != _initial.firstName) return true;
    if (_lastName.text.trim() != _initial.lastName) return true;
    if (_phoneE164 != (_initial.phone ?? '')) return true;
    if (_formatBirthIso(_birthDate) != (_initial.birthDate ?? '')) return true;
    if (_avatarLocalPath != null) return true;
    return false;
  }

  bool get _hasErrors =>
      _firstNameError != null ||
      _lastNameError != null ||
      _phoneError != null ||
      _birthDateError != null;

  Future<void> _pickBirthDate() async {
    final initial = _birthDate ?? DateTime(2000, 1, 1);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() {
        _birthDate = picked;
        _birthDateError = null;
      });
    }
  }

  Future<void> _pickAvatar() async {
    final source = await showModalBottomSheet<_AvatarAction>(
      context: context,
      backgroundColor: AppColors.purpleDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera, color: AppColors.white),
              title: const Text('Камера',
                  style: TextStyle(color: AppColors.white)),
              onTap: () => Navigator.pop(ctx, _AvatarAction.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library, color: AppColors.white),
              title: const Text('Галерея',
                  style: TextStyle(color: AppColors.white)),
              onTap: () => Navigator.pop(ctx, _AvatarAction.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: source == _AvatarAction.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
    );
    if (picked != null && mounted) {
      setState(() => _avatarLocalPath = picked.path);
    }
  }

  /// Returns true if the user has no unsaved changes OR confirmed discard.
  Future<bool> _confirmDiscardIfDirty() async {
    if (!_isDirty) return true;
    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.4),
      builder: (ctx) => ActionDialog(
        icon: const Icon(
          Icons.error_outline,
          size: 50,
          color: AppColors.white,
        ),
        title: 'Отменить изменения?',
        subtitle: 'Изменения не будут сохранены.',
        primaryLabel: 'Отменить',
        secondaryLabel: 'Продолжить',
        secondaryLabelColor: AppColors.purpleTertiary,
        onPrimary: () => Navigator.of(ctx).pop(true),
        onSecondary: () => Navigator.of(ctx).pop(false),
      ),
    );
    return confirmed == true;
  }

  bool _validateAll() {
    String? firstNameErr;
    String? lastNameErr;
    String? phoneErr;
    String? birthDateErr;

    if (!isValidName(_firstName.text)) {
      firstNameErr = 'Введите имя';
    }
    if (!isValidName(_lastName.text)) {
      lastNameErr = 'Введите фамилию';
    }
    if (!_phoneValid || !isValidPhone(_phoneE164)) {
      phoneErr = 'Неверный формат номера';
    }
    if (_birthDate != null) {
      final now = DateTime.now();
      if (_birthDate!.isAfter(now) || _birthDate!.year < 1900) {
        birthDateErr = 'Неверная дата';
      }
    }

    setState(() {
      _firstNameError = firstNameErr;
      _lastNameError = lastNameErr;
      _phoneError = phoneErr;
      _birthDateError = birthDateErr;
    });

    return firstNameErr == null &&
        lastNameErr == null &&
        phoneErr == null &&
        birthDateErr == null;
  }

  Future<void> _save() async {
    if (!_validateAll()) return;
    setState(() => _saving = true);

    try {
      final fbUser = fb.FirebaseAuth.instance.currentUser;
      if (fbUser == null) {
        throw StateError('not_signed_in');
      }
      final token = await fbUser.getIdToken();
      if (token == null) {
        throw StateError('no_id_token');
      }

      final api = ref.read(profileApiProvider);
      final firstNameTrim = _firstName.text.trim();
      final lastNameTrim = _lastName.text.trim();
      final birthIso = _formatBirthIso(_birthDate);

      await api.updateProfile(
        idToken: token,
        firstName:
            firstNameTrim != _initial.firstName ? firstNameTrim : null,
        lastName: lastNameTrim != _initial.lastName ? lastNameTrim : null,
        phone: _phoneE164 != (_initial.phone ?? '') ? _phoneE164 : null,
        birthDate:
            birthIso != (_initial.birthDate ?? '') ? birthIso : null,
        avatarLocalPath: _avatarLocalPath,
      );

      // Pull the canonical /me payload so authProvider drives the cabinet
      // header (avatar, VIP chip, name) without us reaching into its state.
      await ref.read(authProvider.notifier).refresh();

      if (!mounted) return;
      Navigator.of(context).pop();
    } on ProfileUpdateException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        switch (e.code) {
          case 'invalid_first_name':
            _firstNameError = 'Введите корректное имя';
          case 'invalid_last_name':
            _lastNameError = 'Введите корректную фамилию';
          case 'invalid_phone':
            _phoneError = 'Неверный формат номера';
          case 'invalid_birth_date':
            _birthDateError = 'Неверная дата';
          default:
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Не удалось сохранить')),
            );
        }
      });
    } on NetworkException {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Нет соединения с сервером')),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).requireValue!;
    final canSave = _isDirty && !_hasErrors && !_saving;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final ok = await _confirmDiscardIfDirty();
        if (ok && context.mounted) Navigator.of(context).pop();
      },
      child: GradientBackground(
        child: Scaffold(
          backgroundColor: Colors.transparent,
          body: SafeArea(
            child: Column(
              children: [
                _NavBar(
                  saving: _saving,
                  canSave: canSave,
                  onBack: () async {
                    final ok = await _confirmDiscardIfDirty();
                    if (ok && context.mounted) Navigator.of(context).pop();
                  },
                  onSave: _save,
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
                    child: Column(
                      children: [
                        _AvatarBlock(
                          user: user,
                          localPath: _avatarLocalPath,
                          onPick: _pickAvatar,
                        ),
                        const SizedBox(height: 16),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: Column(
                            children: [
                              LabeledTextField(
                                label: 'Имя',
                                controller: _firstName,
                                errorText: _firstNameError,
                                keyboardType: TextInputType.name,
                                maxLength: 50,
                                onChanged: (_) {
                                  if (_firstNameError != null) {
                                    setState(() => _firstNameError = null);
                                  }
                                },
                              ),
                              const SizedBox(height: 16),
                              LabeledTextField(
                                label: 'Фамилия',
                                controller: _lastName,
                                errorText: _lastNameError,
                                keyboardType: TextInputType.name,
                                maxLength: 50,
                                onChanged: (_) {
                                  if (_lastNameError != null) {
                                    setState(() => _lastNameError = null);
                                  }
                                },
                              ),
                              const SizedBox(height: 16),
                              _TapRow(
                                label: 'Дата рождения',
                                value: _formatBirthDisplay(_birthDate),
                                placeholder: 'Выберите дату',
                                errorText: _birthDateError,
                                onTap: _pickBirthDate,
                              ),
                              const SizedBox(height: 16),
                              PhoneField(
                                initialNational: _initialPhoneNational,
                                errorText: _phoneError,
                                onChanged: (v) {
                                  _phoneE164 = v;
                                  if (_phoneError != null) {
                                    setState(() => _phoneError = null);
                                  } else {
                                    _rebuild();
                                  }
                                },
                                onValidityChanged: (v) {
                                  _phoneValid = v;
                                  _rebuild();
                                },
                              ),
                              const SizedBox(height: 16),
                              _ReadOnlyRow(
                                label: 'Электронная почта',
                                value: user.email,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum _AvatarAction { camera, gallery }

class _NavBar extends StatelessWidget {
  final bool saving;
  final bool canSave;
  final VoidCallback onBack;
  final VoidCallback onSave;

  const _NavBar({
    required this.saving,
    required this.canSave,
    required this.onBack,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: Stack(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: onBack,
              icon: const Icon(
                Icons.arrow_back_ios,
                color: AppColors.white,
                size: 20,
              ),
              tooltip: 'Назад',
            ),
          ),
          const Center(
            child: Text(
              'Личные данные',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.4,
              ),
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: TextButton(
                onPressed: canSave ? onSave : null,
                style: TextButton.styleFrom(
                  minimumSize: const Size(48, 44),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                ),
                child: saving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.yellowPrimary,
                        ),
                      )
                    : Text(
                        'Готово',
                        style: TextStyle(
                          color: canSave
                              ? AppColors.yellowPrimary
                              : AppColors.yellowPrimary.withValues(alpha: 0.4),
                          fontSize: 17,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AvatarBlock extends StatelessWidget {
  final AppUser user;
  final String? localPath;
  final VoidCallback onPick;

  const _AvatarBlock({
    required this.user,
    required this.localPath,
    required this.onPick,
  });

  @override
  Widget build(BuildContext context) {
    final isVip = user.clientCategory == 'vip';
    return Column(
      children: [
        GestureDetector(
          onTap: onPick,
          behavior: HitTestBehavior.opaque,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              ClipOval(
                child: SizedBox(
                  width: 98,
                  height: 98,
                  child: localPath != null
                      ? Image.file(
                          File(localPath!),
                          fit: BoxFit.cover,
                          width: 98,
                          height: 98,
                        )
                      : UserAvatar(
                          avatarUrl: user.avatarUrl,
                          firstName: user.firstName,
                          lastName: user.lastName,
                          size: 98,
                        ),
                ),
              ),
              if (isVip)
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          AppColors.yellowGradientTop,
                          AppColors.yellowGradientBottom,
                        ],
                      ),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'VIP',
                      style: TextStyle(
                        color: AppColors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        height: 16 / 13,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: onPick,
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          ),
          child: const Text(
            'Выбрать новое фото',
            style: TextStyle(
              color: AppColors.yellowPrimary,
              fontSize: 17,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.4,
            ),
          ),
        ),
      ],
    );
  }
}

class _TapRow extends StatelessWidget {
  final String label;
  final String value;
  final String placeholder;
  final String? errorText;
  final VoidCallback onTap;

  const _TapRow({
    required this.label,
    required this.value,
    required this.placeholder,
    required this.errorText,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final hasError = errorText != null;
    final showPlaceholder = value.isEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 7),
          child: Text(
            label,
            style: TextStyle(
              color: AppColors.labelSecondaryDark.withValues(alpha: 0.6),
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 16 / 13,
            ),
          ),
        ),
        Material(
          color: AppColors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: hasError ? AppColors.redError : Colors.transparent,
                  width: 1.5,
                ),
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 13,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      showPlaceholder ? placeholder : value,
                      style: TextStyle(
                        color: showPlaceholder
                            ? AppColors.white.withValues(alpha: 0.4)
                            : AppColors.white,
                        fontSize: 17,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (hasError)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              errorText!,
              style: const TextStyle(color: AppColors.redError, fontSize: 12),
            ),
          ),
      ],
    );
  }
}

class _ReadOnlyRow extends StatelessWidget {
  final String label;
  final String value;

  const _ReadOnlyRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 7),
          child: Text(
            label,
            style: TextStyle(
              color: AppColors.labelSecondaryDark.withValues(alpha: 0.6),
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 16 / 13,
            ),
          ),
        ),
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: AppColors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(10),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          child: Text(
            value,
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.6),
              fontSize: 17,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}
