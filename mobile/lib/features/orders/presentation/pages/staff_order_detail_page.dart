import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../chat/data/chat_api_provider.dart';
import '../../data/orders_api.dart' show OrderPatchException;
import '../../domain/order.dart' show formatOrderDate, formatOrderTenge;
import '../../domain/staff_order.dart';
import '../controller/staff_orders_controller.dart';
import '../widgets/booking_conflict_dialog.dart';
import '../widgets/staff_order_status_pill.dart';
import '../widgets/status_change_sheet.dart';

class StaffOrderDetailPage extends ConsumerStatefulWidget {
  final String orderId;

  const StaffOrderDetailPage({super.key, required this.orderId});

  @override
  ConsumerState<StaffOrderDetailPage> createState() =>
      _StaffOrderDetailPageState();
}

class _StaffOrderDetailPageState
    extends ConsumerState<StaffOrderDetailPage> {
  bool _patching = false;
  bool _openingChat = false;

  Future<void> _onTapPayment(StaffOrderDetail order) async {
    if (_patching) return;
    final picked = await showStatusChangeSheet<PaymentStatus>(
      context: context,
      title: 'Изменить статус оплаты',
      current: order.paymentStatus,
      options: paymentStatusOptions(),
    );
    if (picked == null || picked == order.paymentStatus) return;
    if (!mounted) return;
    await _runPatch(() async {
      await ref
          .read(staffOrderDetailProvider(widget.orderId).notifier)
          .patchPayment(picked);
    });
  }

  Future<void> _onTapFulfillment(StaffOrderDetail order) async {
    if (_patching) return;
    final picked = await showStatusChangeSheet<FulfillmentStatus>(
      context: context,
      title: 'Изменить состояние заказа',
      current: order.fulfillmentStatus,
      options: fulfillmentStatusOptions(),
    );
    if (picked == null || picked == order.fulfillmentStatus) return;
    if (!mounted) return;
    await _runFulfillmentPatch(picked, force: false);
  }

  /// Wrapper around the fulfillment patch that intercepts `booking_conflict`
  /// and re-issues with `force=true` after the user confirms in the dialog.
  Future<void> _runFulfillmentPatch(
    FulfillmentStatus target, {
    required bool force,
  }) async {
    await _runPatch(() async {
      try {
        await ref
            .read(staffOrderDetailProvider(widget.orderId).notifier)
            .patchFulfillment(target, force: force);
      } on OrderPatchException catch (e) {
        if (e.code == 'booking_conflict' && !force) {
          if (!mounted) return;
          final confirmed = await showBookingConflictDialog(context);
          if (confirmed == true && mounted) {
            await _runFulfillmentPatch(target, force: true);
          }
          return;
        }
        rethrow;
      }
    });
  }

  Future<void> _runPatch(Future<void> Function() body) async {
    setState(() => _patching = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await body();
    } on OrderPatchException catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(_friendlyPatchError(e.code)),
          duration: const Duration(seconds: 3),
        ),
      );
    } on NetworkException {
      messenger.showSnackBar(
        const SnackBar(content: Text('Нет соединения с сервером')),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить')),
      );
    } finally {
      if (mounted) setState(() => _patching = false);
    }
  }

  Future<void> _openChat(StaffOrderDetail order) async {
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
            clientId: order.client.id,
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
        ref.watch(staffOrderDetailProvider(widget.orderId));

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: detailAsync.when(
            loading: () => Column(
              children: const [
                _NavBar(title: 'Заказ'),
                Expanded(
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.white),
                  ),
                ),
              ],
            ),
            error: (e, _) => Column(
              children: [
                const _NavBar(title: 'Заказ'),
                Expanded(
                  child: _ErrorView(
                    code: _orderLoadErrorCode(e),
                    onRetry: () => ref.invalidate(
                      staffOrderDetailProvider(widget.orderId),
                    ),
                  ),
                ),
              ],
            ),
            data: (order) => Column(
              children: [
                _NavBar(title: '№${order.orderNumber}'),
                Expanded(child: _Body(order: order, parent: this)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _friendlyPatchError(String code) {
  switch (code) {
    case 'forbidden':
      return 'У вас нет доступа к этому заказу.';
    case 'order_not_found':
      return 'Заказ не найден.';
    case 'invalid_payment_status':
    case 'invalid_fulfillment_status':
      return 'Недопустимый статус.';
    case 'status_required':
      return 'Не указан новый статус.';
    case 'order_refunded':
      return 'Заказ возвращён — нельзя снова сделать оплаченным или активным.';
    case 'refund_failed':
      return 'Не удалось вернуть оплату через банк. Попробуйте ещё раз или верните вручную.';
    default:
      return 'Не удалось сохранить';
  }
}

String? _orderLoadErrorCode(Object e) {
  // GET errors are HttpException with `GET /orders/:id: <code>`. We don't
  // need to surface the code on the loading-failed screen — just hint when
  // the order disappeared or RBAC bumped us.
  final msg = e.toString();
  if (msg.contains(': 404')) return 'order_not_found';
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
  final StaffOrderDetail order;
  final _StaffOrderDetailPageState parent;

  const _Body({required this.order, required this.parent});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _SectionLabel('Клиент'),
              const SizedBox(height: 8),
              _ClientRow(
                client: order.client,
                onTap: () =>
                    context.push('/staff/clients/${order.client.id}'),
              ),
              if (order.manager != null) ...[
                const SizedBox(height: 16),
                _SectionLabel('Менеджер'),
                const SizedBox(height: 8),
                _ManagerRow(manager: order.manager!),
              ],
              const SizedBox(height: 16),
              _SectionLabel('Оплата'),
              const SizedBox(height: 8),
              _StatusRow(
                pill: PaymentStatusPill(
                  status: order.paymentStatus,
                  showChevron: true,
                ),
                trailingDate: order.firstPaidAt,
                disabled: parent._patching,
                onTap: () => parent._onTapPayment(order),
              ),
              const SizedBox(height: 16),
              _SectionLabel('Состояние'),
              const SizedBox(height: 8),
              _StatusRow(
                pill: FulfillmentStatusPill(
                  status: order.fulfillmentStatus,
                  showChevron: true,
                ),
                trailingDate: order.createdAt,
                disabled: parent._patching,
                onTap: () => parent._onTapFulfillment(order),
              ),
              const SizedBox(height: 16),
              const _SectionLabel('Товары'),
              const SizedBox(height: 8),
              for (final item in order.items) ...[
                _ItemCard(item: item),
                const SizedBox(height: 8),
              ],
              const SizedBox(height: 8),
              _TotalRow(value: order.totalTenge),
              const SizedBox(height: 24),
              _ChatCta(
                opening: parent._openingChat,
                onTap: () => parent._openChat(order),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
        if (parent._patching)
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

/// Same shape as [_ClientRow] but without the chevron and tap target — staff
/// can't navigate to a manager's profile (no such page yet).
class _ManagerRow extends StatelessWidget {
  final StaffOrderUserSummary manager;
  const _ManagerRow({required this.manager});

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
            avatarUrl: manager.avatarUrl,
            firstName: manager.firstName,
            lastName: manager.lastName,
            size: 40,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  manager.fullName.isEmpty ? manager.email : manager.fullName,
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
                  manager.email,
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
        ],
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  final Widget pill;
  final DateTime? trailingDate;
  final bool disabled;
  final VoidCallback onTap;

  const _StatusRow({
    required this.pill,
    required this.trailingDate,
    required this.disabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: disabled ? 0.5 : 1,
      child: Material(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: disabled ? null : onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              children: [
                pill,
                const Spacer(),
                if (trailingDate != null)
                  Text(
                    formatOrderDate(trailingDate!),
                    style: TextStyle(
                      color: AppColors.white.withValues(alpha: 0.6),
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
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
          _CategoryChip(label: item.productCategoryName),
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
                height: 1.4,
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

class _CategoryChip extends StatelessWidget {
  final String label;
  const _CategoryChip({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: AppColors.white.withValues(alpha: 0.85),
          fontSize: 12,
          fontWeight: FontWeight.w500,
          letterSpacing: -0.1,
        ),
      ),
    );
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
            'Сумма',
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
                  'Написать клиенту',
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

class _ErrorView extends StatelessWidget {
  final String? code;
  final VoidCallback onRetry;

  const _ErrorView({required this.code, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final message = switch (code) {
      'order_not_found' => 'Заказ не найден',
      'forbidden' => 'У вас нет доступа к этому заказу',
      _ => 'Не удалось загрузить заказ',
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
