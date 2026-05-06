import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/tokens.dart';
import '../../data/reviews_api_provider.dart';

const _minLen = 1;
const _maxLen = 1000;

/// Bottom-sheet reply composer for staff. Returns `true` after a successful
/// `POST /reviews/:id/reply`, `null` on cancel. The caller refetches the
/// review feed when it gets `true`.
Future<bool?> showReplyComposer(
  BuildContext context, {
  required String reviewId,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.purpleDark,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _ReplyComposerSheet(reviewId: reviewId),
  );
}

class _ReplyComposerSheet extends ConsumerStatefulWidget {
  final String reviewId;
  const _ReplyComposerSheet({required this.reviewId});

  @override
  ConsumerState<_ReplyComposerSheet> createState() =>
      _ReplyComposerSheetState();
}

class _ReplyComposerSheetState extends ConsumerState<_ReplyComposerSheet> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _ctrl.text.trim();
    if (text.length < _minLen) {
      setState(() => _error = 'Введите текст ответа.');
      return;
    }
    if (text.length > _maxLen) {
      setState(() => _error = 'Слишком длинный текст.');
      return;
    }
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) return;
    final token = await fbUser.getIdToken();
    if (token == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(reviewsApiProvider).reply(
            idToken: token,
            reviewId: widget.reviewId,
            text: text,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Не удалось отправить ответ.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, 16 + bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.white.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Ответ менеджера',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(
                color: AppColors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: TextField(
                controller: _ctrl,
                focusNode: _focus,
                maxLines: 5,
                minLines: 3,
                maxLength: _maxLen,
                cursorColor: AppColors.white,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 15,
                  height: 1.4,
                ),
                decoration: InputDecoration(
                  hintText: 'Напишите ответ…',
                  hintStyle: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.5),
                  ),
                  border: InputBorder.none,
                  counterStyle: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.4),
                    fontSize: 12,
                  ),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: const TextStyle(
                  color: AppColors.redError,
                  fontSize: 13,
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy
                        ? null
                        : () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(
                        color: AppColors.white.withValues(alpha: 0.2),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: const Text(
                      'Отмена',
                      style: TextStyle(
                        color: AppColors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.yellowGradientBottom,
                      foregroundColor: AppColors.purpleDark,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              color: AppColors.purpleDark,
                              strokeWidth: 2,
                            ),
                          )
                        : const Text(
                            'Отправить',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
