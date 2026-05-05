import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../../core/widgets/action_dialog.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../chat/data/chat_api_provider.dart';
import '../../data/clients_api.dart';
import '../../domain/client.dart';
import '../controller/client_detail_controller.dart';

/// "Профиль клиента" — read-only fields (birth date, phone, email) plus a
/// single editable field, "Комментарий к клиенту". The Figma "Новые заказы"
/// section is intentionally dropped (см. user request); the remaining
/// "История покупок" row pushes a tabbed staff-side purchases screen.
class ClientDetailPage extends ConsumerStatefulWidget {
  final String clientId;
  const ClientDetailPage({super.key, required this.clientId});

  @override
  ConsumerState<ClientDetailPage> createState() => _ClientDetailPageState();
}

class _ClientDetailPageState extends ConsumerState<ClientDetailPage> {
  late TextEditingController _commentCtrl;
  String _initialComment = '';
  bool _saving = false;
  bool _openingChat = false;

  @override
  void initState() {
    super.initState();
    final cached = ref.read(clientByIdProvider(widget.clientId));
    _initialComment = cached?.comment ?? '';
    _commentCtrl = TextEditingController(text: _initialComment)
      ..addListener(_rebuild);
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  bool get _isDirty => _commentCtrl.text.trim() != _initialComment.trim();

  Future<bool> _confirmDiscardIfDirty() async {
    if (!_isDirty) return true;
    final ok = await showDialog<bool>(
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
    return ok == true;
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final newComment = _commentCtrl.text.trim();
      await updateClientComment(
        ref: ref,
        clientId: widget.clientId,
        comment: newComment,
      );
      if (!mounted) return;
      setState(() {
        _initialComment = newComment;
        _saving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Комментарий сохранён'),
          duration: Duration(seconds: 2),
        ),
      );
    } on ClientUpdateException {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить')),
      );
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

  /// Tap on the chat icon — get-or-create the thread for this client and
  /// push the staff conversation page. Manager-role actors can only open
  /// threads for clients they own; backend returns 403 otherwise.
  Future<void> _openChat() async {
    if (_openingChat) return;
    setState(() => _openingChat = true);
    try {
      final fbUser = fb.FirebaseAuth.instance.currentUser;
      if (fbUser == null) throw StateError('not_signed_in');
      final token = await fbUser.getIdToken();
      if (token == null) throw StateError('no_id_token');
      final threadId = await ref.read(chatApiProvider).openThreadWithClient(
            idToken: token,
            clientId: widget.clientId,
          );
      if (!mounted) return;
      context.push('/staff/chat/$threadId');
    } on NetworkException {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Нет соединения с сервером')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось открыть чат')),
      );
    } finally {
      if (mounted) setState(() => _openingChat = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final client = ref.watch(clientByIdProvider(widget.clientId));
    final canSave = _isDirty && !_saving;

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
            child: client == null
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.white),
                  )
                : Column(
                children: [
                  _NavBar(
                    saving: _saving,
                    canSave: canSave,
                    onBack: () async {
                      final ok = await _confirmDiscardIfDirty();
                      if (ok && context.mounted) Navigator.of(context).pop();
                    },
                    onSave: _save,
                    onOpenChat: _openChat,
                    openingChat: _openingChat,
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
                      child: Column(
                        children: [
                          _AvatarBlock(client: client),
                          const SizedBox(height: 16),
                          Padding(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 16),
                            child: Column(
                              children: [
                                _ReadOnlyRow(
                                  label: 'Дата рождения',
                                  value: formatBirthDateDdMmYyyy(
                                    client.birthDate,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                _ReadOnlyRow(
                                  label: 'Номер телефона',
                                  value: client.phone ?? '',
                                ),
                                const SizedBox(height: 16),
                                _ReadOnlyRow(
                                  label: 'Электронная почта',
                                  value: client.email,
                                ),
                                const SizedBox(height: 16),
                                _CommentField(controller: _commentCtrl),
                                const SizedBox(height: 24),
                                _PurchasesRow(
                                  onTap: () => context.push(
                                    '/staff/clients/${client.id}/purchases',
                                  ),
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

class _NavBar extends StatelessWidget {
  final bool saving;
  final bool canSave;
  final bool openingChat;
  final VoidCallback onBack;
  final VoidCallback onSave;
  final VoidCallback onOpenChat;

  const _NavBar({
    required this.saving,
    required this.canSave,
    required this.openingChat,
    required this.onBack,
    required this.onSave,
    required this.onOpenChat,
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
              'Профиль',
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
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (canSave || saving)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
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
                          : const Text(
                              'Готово',
                              style: TextStyle(
                                color: AppColors.yellowPrimary,
                                fontSize: 17,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                    ),
                  ),
                IconButton(
                  onPressed: openingChat ? null : onOpenChat,
                  icon: openingChat
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.white,
                          ),
                        )
                      : const Icon(
                          Icons.chat_bubble_outline,
                          color: AppColors.white,
                          size: 22,
                        ),
                  tooltip: 'Открыть чат',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AvatarBlock extends StatelessWidget {
  final Client client;
  const _AvatarBlock({required this.client});

  @override
  Widget build(BuildContext context) {
    final isVip = client.clientCategory == 'vip';
    return Column(
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            UserAvatar(
              avatarUrl: client.avatarUrl,
              firstName: client.firstName,
              lastName: client.lastName,
              size: 98,
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
        const SizedBox(height: 12),
        Text(
          client.fullName.isEmpty ? '—' : client.fullName,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.white,
            fontSize: 17,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.4,
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
            value.isEmpty ? '—' : value,
            style: TextStyle(
              color: value.isEmpty
                  ? AppColors.white.withValues(alpha: 0.4)
                  : AppColors.white.withValues(alpha: 0.85),
              fontSize: 17,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}

class _CommentField extends StatelessWidget {
  final TextEditingController controller;

  const _CommentField({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 7),
          child: Text(
            'Комментарий к клиенту',
            style: TextStyle(
              color: AppColors.labelSecondaryDark.withValues(alpha: 0.6),
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 16 / 13,
            ),
          ),
        ),
        TextField(
          controller: controller,
          maxLines: 4,
          minLines: 4,
          maxLength: 1000,
          style: const TextStyle(
            color: AppColors.white,
            fontSize: 17,
            height: 1.3,
          ),
          cursorColor: AppColors.white,
          decoration: InputDecoration(
            counterText: '',
            filled: true,
            fillColor: AppColors.white.withValues(alpha: 0.1),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 13,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none,
            ),
          ),
        ),
      ],
    );
  }
}

class _PurchasesRow extends StatelessWidget {
  final VoidCallback onTap;
  const _PurchasesRow({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              const Icon(
                Icons.history,
                color: AppColors.white,
                size: 22,
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  'История покупок',
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: AppColors.white.withValues(alpha: 0.6),
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
