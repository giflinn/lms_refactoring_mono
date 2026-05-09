import 'dart:io' show Platform;

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../data/feedback_api.dart';
import '../../data/feedback_api_provider.dart';

/// "Обратная связь" — client form. Имя/email pre-filled and read-only (the
/// signed-in user owns them; editing happens elsewhere). Single multiline
/// "Сообщение" field. On success → SuccessDialog matching Figma → pop back
/// to settings.
class FeedbackPage extends ConsumerStatefulWidget {
  const FeedbackPage({super.key});

  @override
  ConsumerState<FeedbackPage> createState() => _FeedbackPageState();
}

class _FeedbackPageState extends ConsumerState<FeedbackPage> {
  final _message = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _message.addListener(_rebuild);
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  Future<void> _submit() async {
    final text = _message.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final fbUser = fb.FirebaseAuth.instance.currentUser;
      if (fbUser == null) throw StateError('not_signed_in');
      final token = await fbUser.getIdToken();
      if (token == null) throw StateError('no_id_token');

      // Best-effort meta — never block the submit on it.
      String? appVersion;
      try {
        final info = await PackageInfo.fromPlatform();
        appVersion = info.version;
      } catch (_) {}
      final platform = Platform.isIOS
          ? 'ios'
          : Platform.isAndroid
              ? 'android'
              : null;

      await ref.read(feedbackApiProvider).submit(
            idToken: token,
            message: text,
            platform: platform,
            appVersion: appVersion,
          );

      if (!mounted) return;
      await _showSuccessDialog();
      if (!mounted) return;
      context.pop();
    } on FeedbackSubmitException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = switch (e.code) {
          'message_required' => 'Введите сообщение',
          'message_too_long' => 'Сообщение слишком длинное',
          _ => 'Не удалось отправить',
        };
      });
    } on NetworkException {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'Нет соединения с сервером';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'Не удалось отправить';
      });
    }
  }

  Future<void> _showSuccessDialog() {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withValues(alpha: 0.4),
      builder: (ctx) => const _FeedbackSuccessDialog(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).value;
    if (user == null) {
      return const GradientBackground(
        child: Scaffold(backgroundColor: Colors.transparent),
      );
    }
    final fullName = '${user.firstName} ${user.lastName}'.trim();
    final canSubmit = !_submitting && _message.text.trim().isNotEmpty;

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        resizeToAvoidBottomInset: true,
        body: SafeArea(
          child: Column(
            children: [
              const _NavBar(),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _ReadOnlyField(
                        label: 'Имя',
                        value: fullName.isEmpty ? '—' : fullName,
                      ),
                      const SizedBox(height: 16),
                      _ReadOnlyField(
                        label: 'Электронная почта',
                        value: user.email,
                      ),
                      const SizedBox(height: 16),
                      _MessageField(
                        controller: _message,
                        errorText: _error,
                        onChanged: (_) {
                          if (_error != null) {
                            setState(() => _error = null);
                          }
                        },
                      ),
                      const SizedBox(height: 24),
                      PrimaryButton(
                        label: 'Отправить',
                        loading: _submitting,
                        onPressed: canSubmit ? _submit : null,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavBar extends StatelessWidget {
  const _NavBar();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: Stack(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: () => Navigator.of(context).pop(),
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
              'Обратная связь',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReadOnlyField extends StatelessWidget {
  final String label;
  final String value;

  const _ReadOnlyField({required this.label, required this.value});

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

class _MessageField extends StatelessWidget {
  final TextEditingController controller;
  final String? errorText;
  final ValueChanged<String> onChanged;

  const _MessageField({
    required this.controller,
    required this.errorText,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final hasError = errorText != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 7),
          child: Text(
            'Сообщение',
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
              color: hasError
                  ? AppColors.redError
                  : AppColors.white.withValues(alpha: 0.6),
              width: 1.5,
            ),
          ),
          child: TextField(
            controller: controller,
            onChanged: onChanged,
            minLines: 4,
            maxLines: 8,
            maxLength: 5000,
            keyboardType: TextInputType.multiline,
            textInputAction: TextInputAction.newline,
            style: const TextStyle(color: AppColors.white, fontSize: 17),
            cursorColor: AppColors.white,
            decoration: const InputDecoration(
              isCollapsed: true,
              border: InputBorder.none,
              counterText: '',
              contentPadding: EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 13,
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

/// Matches the Figma popup: gradient purple card, send-icon-in-circle,
/// title + subtitle + orange Ок. The `SuccessDialog` core widget uses a
/// hollow circle around the icon, but Figma renders the paper-plane icon
/// without a ring on the feedback success — so this is local.
class _FeedbackSuccessDialog extends StatelessWidget {
  const _FeedbackSuccessDialog();

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 32),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 24, 12, 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.purpleGradientTop,
              AppColors.purplePrimary,
            ],
          ),
          borderRadius: BorderRadius.circular(24),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 50,
              height: 50,
              child: Icon(
                Icons.send_outlined,
                color: AppColors.white,
                size: 44,
              ),
            ),
            const SizedBox(height: 24),
            const SizedBox(
              width: 252,
              child: Column(
                children: [
                  Text(
                    'Сообщение успешно отправлено',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w500,
                      height: 1.3,
                      letterSpacing: -0.4,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Наш менеджер свяжется с вами в ближайшее время.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.purpleTertiary,
                      fontSize: 15,
                      height: 1.34,
                      letterSpacing: -0.4,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            PrimaryButton(
              label: 'Ок',
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}
