import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../../core/widgets/star_rating.dart';
import '../../../../core/widgets/success_dialog.dart';
import '../../data/reviews_api.dart';
import '../../domain/leave_review_args.dart';
import '../controller/my_reviews_controller.dart';

/// Single submit/edit form. Used for both "new review" (from completed order
/// card) and "edit pending review" (from "Мои отзывы" kebab). Behavior is
/// switched by [LeaveReviewArgs.isEdit].
class LeaveReviewPage extends ConsumerStatefulWidget {
  final LeaveReviewArgs args;

  const LeaveReviewPage({super.key, required this.args});

  @override
  ConsumerState<LeaveReviewPage> createState() => _LeaveReviewPageState();
}

class _LeaveReviewPageState extends ConsumerState<LeaveReviewPage> {
  late final TextEditingController _controller;
  late int _rating;
  String? _error;
  bool _submitting = false;

  static const int _minLength = 10;
  static const int _maxLength = 1000;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.args.initialText ?? '');
    _rating = widget.args.initialRating ?? 5;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (_rating < 1) {
      setState(() => _error = 'Поставьте оценку от 1 до 5');
      return;
    }
    if (text.length < _minLength) {
      setState(() => _error = 'Минимум $_minLength символов');
      return;
    }
    if (text.length > _maxLength) {
      setState(() => _error = 'Максимум $_maxLength символов');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      if (widget.args.isEdit) {
        await ref.read(myReviewsProvider.notifier).edit(
              reviewId: widget.args.reviewId!,
              rating: _rating,
              text: text,
            );
      } else {
        await ref.read(myReviewsProvider.notifier).submit(
              productId: widget.args.productId,
              rating: _rating,
              text: text,
            );
      }
      if (!mounted) return;
      // Pop the form first so the success dialog sits on the previous screen.
      Navigator.of(context).pop();
      if (!context.mounted) return;
      await SuccessDialog.show(
        context,
        icon: Icons.chat_bubble_outline_rounded,
        title: widget.args.isEdit
            ? 'Ваш отзыв обновлён'
            : 'Ваш отзыв успешно отправлен',
        message:
            'Высказывая своё мнение, вы помогаете нам стать лучше.',
        buttonLabel: 'Подтвердить',
      );
    } on ReviewException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = _friendlyMessage(e.code);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'Не удалось отправить отзыв. Попробуйте позже.';
      });
    }
  }

  String _friendlyMessage(String code) {
    switch (code) {
      case 'no_completed_order':
        return 'Этот товар нельзя оценить — нет завершённого заказа.';
      case 'review_deleted':
        return 'Этот отзыв уже удалён.';
      case 'text_too_short':
        return 'Минимум $_minLength символов';
      case 'text_too_long':
        return 'Максимум $_maxLength символов';
      case 'invalid_rating':
        return 'Поставьте оценку от 1 до 5';
      default:
        return 'Не удалось отправить отзыв. Попробуйте позже.';
    }
  }

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: true,
          leading: IconButton(
            icon: const Icon(Icons.chevron_left_rounded,
                color: AppColors.white, size: 28),
            onPressed: () => context.pop(),
          ),
          title: const Text(
            'Отзыв',
            style: TextStyle(
              color: AppColors.white,
              fontSize: 17,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.4,
            ),
          ),
        ),
        body: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  widget.args.productTitle,
                  style: const TextStyle(
                    color: AppColors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w600,
                    height: 1.15,
                    letterSpacing: -0.6,
                  ),
                ),
                const SizedBox(height: 24),
                Center(
                  child: StarRating(
                    value: _rating,
                    size: 36,
                    onChanged: _submitting
                        ? null
                        : (v) {
                            setState(() {
                              _rating = v;
                              _error = null;
                            });
                          },
                  ),
                ),
                const SizedBox(height: 24),
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.white.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _error != null
                            ? AppColors.redError
                            : AppColors.white.withValues(alpha: 0.3),
                      ),
                    ),
                    child: TextField(
                      controller: _controller,
                      maxLines: null,
                      expands: true,
                      maxLength: _maxLength,
                      enabled: !_submitting,
                      onChanged: (_) {
                        if (_error != null) setState(() => _error = null);
                      },
                      textAlignVertical: TextAlignVertical.top,
                      style: const TextStyle(
                        color: AppColors.white,
                        fontSize: 15,
                        height: 1.4,
                        letterSpacing: -0.2,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Поделитесь впечатлениями…',
                        hintStyle: TextStyle(
                          color: AppColors.white.withValues(alpha: 0.5),
                        ),
                        counterText: '',
                        border: InputBorder.none,
                        contentPadding:
                            const EdgeInsets.fromLTRB(14, 12, 14, 12),
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
                PrimaryButton(
                  label: 'Отправить',
                  loading: _submitting,
                  onPressed: _submitting ? null : _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
