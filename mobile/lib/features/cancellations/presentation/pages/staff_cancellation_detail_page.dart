import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../chat/data/chat_api_provider.dart';
import '../../../orders/domain/order.dart' show formatOrderDate, formatOrderTenge;
import '../../../orders/domain/staff_order.dart';
import '../../../orders/presentation/widgets/staff_order_status_pill.dart';
import '../../data/cancellations_api.dart' show CancellationDecisionException;
import '../../domain/cancellation.dart';
import '../controller/staff_cancellations_controller.dart';
import '../widgets/cancellation_list_tile.dart' show formatLongDate;
import '../widgets/cancellation_status_pill.dart';
import '../widgets/decide_cancellation_dialog.dart';

class StaffCancellationDetailPage extends ConsumerStatefulWidget {
  final String cancellationId;

  const StaffCancellationDetailPage({
    super.key,
    required this.cancellationId,
  });

  @override
  ConsumerState<StaffCancellationDetailPage> createState() =>
      _StaffCancellationDetailPageState();
}

class _StaffCancellationDetailPageState
    extends ConsumerState<StaffCancellationDetailPage> {
  bool _deciding = false;
  bool _openingChat = false;

  Future<void> _onDecideTap(StaffCancellationDetail c) async {
    if (_deciding || c.status != CancellationStatus.requested) return;
    final result = await showDecideCancellationDialog(context);
    if (result == null) return;
    if (!mounted) return;
    await _decide(decision: result.decision, comment: result.comment);
  }

  Future<void> _decide({
    required CancellationStatus decision,
    String? comment,
  }) async {
    setState(() => _deciding = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(staffCancellationDetailProvider(widget.cancellationId)
              .notifier)
          .decide(decision: decision, comment: comment);
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            decision == CancellationStatus.approved
                ? 'Отмена заказа подтверждена'
                : 'В отмене заказа отказано',
          ),
          duration: const Duration(seconds: 2),
        ),
      );
      // Pop back to the list — the user usually wants to act on the next
      // request. The list invalidation already happened inside decide().
      context.pop();
    } on CancellationDecisionException catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(_friendlyDecisionError(e.code)),
          duration: const Duration(seconds: 3),
        ),
      );
    } on NetworkException {
      messenger.showSnackBar(
        const SnackBar(content: Text('Нет соединения с сервером')),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить решение')),
      );
    } finally {
      if (mounted) setState(() => _deciding = false);
    }
  }

  Future<void> _openChat(StaffCancellationDetail c) async {
    if (_openingChat) return;
    setState(() => _openingChat = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final fbUser = fb.FirebaseAuth.instance.currentUser;
      if (fbUser == null) throw StateError('not_signed_in');
      final token = await fbUser.getIdToken();
      if (token == null) throw StateError('no_id_token');
      final threadId = await ref.read(chatApiProvider).openThreadWithClient(
            idToken: token,
            clientId: c.client.id,
          );
      if (!mounted) return;
      context.push('/staff/chat/$threadId');
    } on NetworkException {
      messenger.showSnackBar(
        const SnackBar(content: Text('Нет соединения с сервером')),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Не удалось открыть чат')),
      );
    } finally {
      if (mounted) setState(() => _openingChat = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detailAsync =
        ref.watch(staffCancellationDetailProvider(widget.cancellationId));

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: detailAsync.when(
            loading: () => Column(
              children: const [
                _NavBar(title: 'Запрос'),
                Expanded(
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.white),
                  ),
                ),
              ],
            ),
            error: (e, _) => Column(
              children: [
                const _NavBar(title: 'Запрос'),
                Expanded(
                  child: _ErrorView(
                    code: _detailErrorCode(e),
                    onRetry: () => ref.invalidate(
                      staffCancellationDetailProvider(widget.cancellationId),
                    ),
                  ),
                ),
              ],
            ),
            data: (c) => Column(
              children: [
                _NavBar(title: '№${c.orderNumber}'),
                Expanded(child: _Body(detail: c, parent: this)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _friendlyDecisionError(String code) {
  switch (code) {
    case 'cancellation_already_decided':
      return 'Этот запрос уже обработан другим менеджером.';
    case 'forbidden':
      return 'У вас нет доступа к этому запросу.';
    case 'cancellation_not_found':
      return 'Запрос не найден.';
    case 'invalid_decision':
      return 'Недопустимое решение.';
    default:
      return 'Не удалось сохранить решение.';
  }
}

String? _detailErrorCode(Object e) {
  final msg = e.toString();
  if (msg.contains(': 404')) return 'cancellation_not_found';
  if (msg.contains(': 403')) return 'forbidden';
  return null;
}

class _NavBar extends StatelessWidget {
  final String title;
  const _NavBar({required this.title});

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
          Center(
            child: Text(
              title,
              style: const TextStyle(
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

class _Body extends StatelessWidget {
  final StaffCancellationDetail detail;
  final _StaffCancellationDetailPageState parent;

  const _Body({required this.detail, required this.parent});

  @override
  Widget build(BuildContext context) {
    final isPending = detail.status == CancellationStatus.requested;

    return Stack(
      children: [
        SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _SectionLabel('Клиент'),
              const SizedBox(height: 8),
              _ClientRow(
                client: detail.client,
                onTap: () =>
                    context.push('/staff/clients/${detail.client.id}'),
              ),
              const SizedBox(height: 16),
              const _SectionLabel('Статус запроса'),
              const SizedBox(height: 8),
              _CancellationStatusBlock(detail: detail),
              const SizedBox(height: 16),
              const _SectionLabel('Заказ'),
              const SizedBox(height: 8),
              _OrderSnapshot(
                detail: detail,
                onOpen: () =>
                    context.push('/staff/orders/${detail.orderId}'),
              ),
              const SizedBox(height: 16),
              const _SectionLabel('Причина клиента'),
              const SizedBox(height: 8),
              _TextBlock(
                text: detail.clientReason,
                emptyLabel: 'Клиент не указал причину',
              ),
              if (!isPending) ...[
                const SizedBox(height: 16),
                const _SectionLabel('Комментарий менеджера'),
                const SizedBox(height: 8),
                _TextBlock(
                  text: detail.decisionComment,
                  emptyLabel: 'Без комментария',
                ),
              ],
              if (detail.decidedBy != null) ...[
                const SizedBox(height: 16),
                const _SectionLabel('Решение принял'),
                const SizedBox(height: 8),
                _PersonReadOnlyRow(
                  user: detail.decidedBy!,
                  trailingDate: detail.decidedAt,
                ),
              ],
              const SizedBox(height: 16),
              const _SectionLabel('Товары'),
              const SizedBox(height: 8),
              for (final item in detail.items) ...[
                _ItemCard(item: item),
                const SizedBox(height: 8),
              ],
              const SizedBox(height: 8),
              _TotalRow(value: detail.orderTotalTenge),
              const SizedBox(height: 24),
              _ChatCta(
                opening: parent._openingChat,
                onTap: () => parent._openChat(detail),
              ),
              if (isPending) ...[
                const SizedBox(height: 8),
                _DecideCta(
                  pending: parent._deciding,
                  onTap: () => parent._onDecideTap(detail),
                ),
              ],
              const SizedBox(height: 24),
            ],
          ),
        ),
        if (parent._deciding)
          const Positioned.fill(
            child: ColoredBox(
              color: Color(0x33000000),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.white),
              ),
            ),
          ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        text,
        style: TextStyle(
          color: AppColors.purpleTertiary.withValues(alpha: 0.85),
          fontSize: 13,
          fontWeight: FontWeight.w500,
          height: 16 / 13,
        ),
      ),
    );
  }
}

class _ClientRow extends StatelessWidget {
  final StaffOrderUserSummary client;
  final VoidCallback onTap;

  const _ClientRow({required this.client, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              UserAvatar(
                avatarUrl: client.avatarUrl,
                firstName: client.firstName,
                lastName: client.lastName,
                size: 40,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      client.fullName.isEmpty ? client.email : client.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      client.email,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppColors.white.withValues(alpha: 0.6),
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ],
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

/// Big status pill block: shows the cancellation status (Запрошено/Одобрено/
/// Отказано) and, when decided, the decision date and the deciding manager.
class _CancellationStatusBlock extends StatelessWidget {
  final StaffCancellationDetail detail;

  const _CancellationStatusBlock({required this.detail});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: Row(
        children: [
          CancellationStatusPill(status: detail.status, large: true),
          const Spacer(),
          Text(
            formatLongDate(detail.decidedAt ?? detail.createdAt),
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.6),
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderSnapshot extends StatelessWidget {
  final StaffCancellationDetail detail;
  final VoidCallback onOpen;

  const _OrderSnapshot({required this.detail, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Text(
                    '№ ${detail.orderNumber}',
                    style: const TextStyle(
                      color: AppColors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      letterSpacing: -0.4,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    Icons.chevron_right,
                    color: AppColors.white.withValues(alpha: 0.6),
                    size: 20,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  PaymentStatusPill(status: detail.orderPaymentStatus),
                  FulfillmentStatusPill(
                    status: detail.orderFulfillmentStatus,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TextBlock extends StatelessWidget {
  final String? text;
  final String emptyLabel;

  const _TextBlock({required this.text, required this.emptyLabel});

  @override
  Widget build(BuildContext context) {
    final isEmpty = text == null || text!.trim().isEmpty;
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: Text(
        isEmpty ? emptyLabel : text!,
        style: TextStyle(
          color: isEmpty
              ? AppColors.white.withValues(alpha: 0.5)
              : AppColors.white,
          fontSize: 14,
          fontWeight: FontWeight.w500,
          height: 1.4,
          letterSpacing: -0.2,
        ),
      ),
    );
  }
}

class _PersonReadOnlyRow extends StatelessWidget {
  final StaffOrderUserSummary user;
  final DateTime? trailingDate;

  const _PersonReadOnlyRow({required this.user, required this.trailingDate});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: Row(
        children: [
          UserAvatar(
            avatarUrl: user.avatarUrl,
            firstName: user.firstName,
            lastName: user.lastName,
            size: 36,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.fullName.isEmpty ? user.email : user.fullName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                ),
                if (trailingDate != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    formatOrderDate(trailingDate!),
                    style: TextStyle(
                      color: AppColors.white.withValues(alpha: 0.6),
                      fontSize: 12,
                      height: 1.3,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  final StaffOrderItem item;

  const _ItemCard({required this.item});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.white.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              item.productCategoryName,
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.85),
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            item.productTitle,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 15,
              fontWeight: FontWeight.w500,
              height: 1.3,
              letterSpacing: -0.4,
            ),
          ),
          if (_dateLabel(item) != null) ...[
            const SizedBox(height: 4),
            Text(
              _dateLabel(item)!,
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.6),
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              const Spacer(),
              Text(
                '${formatOrderTenge(item.unitPriceTenge)} ₸',
                style: const TextStyle(
                  color: AppColors.yellowPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -0.4,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String? _dateLabel(StaffOrderItem item) {
    if (item.bookedStart != null && item.bookedEnd != null) {
      return formatBookingRange(item.bookedStart!, item.bookedEnd!);
    }
    if (item.expiresAt != null) {
      return 'до ${formatOrderDate(item.expiresAt!)}';
    }
    return item.productSubtitle;
  }
}

class _TotalRow extends StatelessWidget {
  final num value;
  const _TotalRow({required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Text(
            'Сумма заказа',
            style: TextStyle(
              color: AppColors.purpleTertiary,
              fontSize: 15,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.4,
            ),
          ),
          const Spacer(),
          Text(
            '${formatOrderTenge(value)} ₸',
            style: const TextStyle(
              color: AppColors.yellowPrimary,
              fontSize: 17,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatCta extends StatelessWidget {
  final bool opening;
  final VoidCallback onTap;

  const _ChatCta({required this.opening, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: opening ? null : onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          height: 54,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.yellowGradientTop,
                AppColors.yellowGradientBottom,
              ],
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: opening
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.purpleDark,
                  ),
                )
              : const Text(
                  'Перейти в чат',
                  style: TextStyle(
                    color: AppColors.purpleDark,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                ),
        ),
      ),
    );
  }
}

class _DecideCta extends StatelessWidget {
  final bool pending;
  final VoidCallback onTap;

  const _DecideCta({required this.pending, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: pending ? null : onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 54,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          border: Border.all(color: AppColors.white.withValues(alpha: 0.2)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Text(
          'Принять решение',
          style: TextStyle(
            color: AppColors.white,
            fontSize: 15,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.4,
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String? code;
  final VoidCallback onRetry;

  const _ErrorView({required this.code, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final message = switch (code) {
      'cancellation_not_found' => 'Запрос не найден',
      'forbidden' => 'У вас нет доступа к этому запросу',
      _ => 'Не удалось загрузить запрос',
    };
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.85),
                fontSize: 15,
              ),
            ),
            if (code == null) ...[
              const SizedBox(height: 12),
              TextButton(
                onPressed: onRetry,
                child: const Text(
                  'Повторить',
                  style: TextStyle(
                    color: AppColors.yellowPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
