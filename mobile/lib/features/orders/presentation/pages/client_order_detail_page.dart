import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../telegram/presentation/controller/telegram_link_controller.dart';
import '../../data/orders_api.dart' show TelegramInviteException;
import '../../domain/order.dart';
import '../controller/client_order_detail_controller.dart';
import 'my_purchases_page.dart' show ChatPrefill;

/// Per-order detail screen. Renders one card per item, with the right CTAs:
///   - Booking item   → date / time / duration + "Связаться с менеджером"
///   - Telegram item  → group info + state-driven CTA (link or open invite)
///   - Plain item     → snapshot + expiry hint
///
/// Pure orchestration page; widgets are inline private classes — extract
/// once any of them is reused outside this screen.
class ClientOrderDetailPage extends ConsumerWidget {
  final String orderId;

  const ClientOrderDetailPage({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(clientOrderDetailProvider(orderId));
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: const BackButton(color: AppColors.greyDark),
        title: state.maybeWhen(
          data: (order) => Text(
            '№${order.orderNumber}',
            style: const TextStyle(
              color: AppColors.greyDark,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          orElse: () => const Text(
            'Заказ',
            style: TextStyle(
              color: AppColors.greyDark,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => _ErrorView(
          message: err is NetworkException
              ? 'Нет соединения с сервером'
              : 'Не удалось загрузить заказ',
          onRetry: () => ref
              .read(clientOrderDetailProvider(orderId).notifier)
              .refresh(),
        ),
        data: (order) => RefreshIndicator(
          onRefresh: () => ref
              .read(clientOrderDetailProvider(orderId).notifier)
              .refresh(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              _OrderHeader(order: order),
              const SizedBox(height: 16),
              for (var i = 0; i < order.items.length; i++) ...[
                _ItemCard(orderId: orderId, item: order.items[i], order: order),
                if (i != order.items.length - 1) const SizedBox(height: 12),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderHeader extends StatelessWidget {
  final ClientOrderDetail order;

  const _OrderHeader({required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.greyMedium.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Создан ${formatOrderDate(order.createdAt)}',
            style: const TextStyle(color: AppColors.greyMedium, fontSize: 13),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _StatusPill(status: order.status),
              Text(
                '${formatOrderTenge(order.totalTenge)} ₸',
                style: const TextStyle(
                  color: AppColors.greyDark,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          if (order.manager != null) ...[
            const SizedBox(height: 12),
            Text(
              'Менеджер: ${order.manager!.fullName}',
              style: const TextStyle(color: AppColors.greyDark, fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final OrderStatus status;

  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, fg, bg) = switch (status) {
      OrderStatus.newOrder => ('Новый', AppColors.purplePrimary, AppColors.purpleTertiary),
      OrderStatus.active => ('Активный', Colors.green.shade700, Colors.green.shade50),
      OrderStatus.completed => ('Завершён', AppColors.greyDark, AppColors.greyLighter),
      OrderStatus.cancelled => ('Отменён', Colors.red.shade700, Colors.red.shade50),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _ItemCard extends ConsumerWidget {
  final String orderId;
  final ClientOrderDetailItem item;
  final ClientOrderDetail order;

  const _ItemCard({
    required this.orderId,
    required this.item,
    required this.order,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.greyMedium.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.productCategoryName,
            style: const TextStyle(
              color: AppColors.greyMedium,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            item.productTitle,
            style: const TextStyle(
              color: AppColors.greyDark,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (item.productSubtitle != null &&
              item.productSubtitle!.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              item.productSubtitle!,
              style:
                  const TextStyle(color: AppColors.greyMedium, fontSize: 13),
            ),
          ],
          const SizedBox(height: 12),
          if (item.isBooking)
            _BookingBlock(item: item, order: order)
          else if (item.isTelegram)
            _TelegramBlock(orderId: orderId, item: item, order: order)
          else
            _PlainBlock(item: item),
        ],
      ),
    );
  }
}

// ----- booking variant -----

class _BookingBlock extends ConsumerStatefulWidget {
  final ClientOrderDetailItem item;
  final ClientOrderDetail order;

  const _BookingBlock({required this.item, required this.order});

  @override
  ConsumerState<_BookingBlock> createState() => _BookingBlockState();
}

class _BookingBlockState extends ConsumerState<_BookingBlock> {
  bool _opening = false;

  @override
  Widget build(BuildContext context) {
    final start = widget.item.bookedStart!;
    final dur = widget.item.durationMinutes;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoRow(label: 'Дата', value: formatOrderDate(start)),
        if (dur != null)
          _InfoRow(label: 'Длительность', value: '$dur мин'),
        const SizedBox(height: 12),
        _PrimaryCta(
          label: _opening ? 'Открываем чат…' : 'Связаться с менеджером',
          onTap: _opening ? null : _openChat,
        ),
      ],
    );
  }

  Future<void> _openChat() async {
    setState(() => _opening = true);
    try {
      final draft =
          'По поводу заказа №${widget.order.orderNumber} (${widget.item.productTitle})';
      if (!mounted) return;
      context.push('/client/chat', extra: ChatPrefill(text: draft));
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }
}

// ----- telegram variant -----

class _TelegramBlock extends ConsumerStatefulWidget {
  final String orderId;
  final ClientOrderDetailItem item;
  final ClientOrderDetail order;

  const _TelegramBlock({
    required this.orderId,
    required this.item,
    required this.order,
  });

  @override
  ConsumerState<_TelegramBlock> createState() => _TelegramBlockState();
}

class _TelegramBlockState extends ConsumerState<_TelegramBlock> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final group = widget.item.telegramGroup!;
    final m = widget.item.telegramMembership;
    final orderActive = widget.order.status == OrderStatus.active;
    final linkState = ref.watch(telegramLinkProvider);

    final body = <Widget>[
      _InfoRow(label: 'Тип', value: group.kindLabel),
      _InfoRow(label: 'Группа', value: group.title),
      if (group.description != null && group.description!.isNotEmpty) ...[
        const SizedBox(height: 4),
        Text(
          group.description!,
          style: const TextStyle(color: AppColors.greyDark, fontSize: 13),
        ),
      ],
      if (widget.item.expiresAt != null)
        _InfoRow(
          label: 'Доступ до',
          value: formatOrderDate(widget.item.expiresAt!),
        ),
    ];

    final ctaLabel = _ctaLabel(orderActive, m);
    final disabled = !orderActive ||
        (m != null && !m.isActive) ||
        _busy ||
        linkState.isLoading;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...body,
        const SizedBox(height: 12),
        if (!orderActive)
          const _Hint(text: 'Доступ к группе закрыт.')
        else if (m?.status == OrderTelegramMembershipStatus.kicked)
          const _Hint(text: 'Вас удалили из группы. Свяжитесь с менеджером.')
        else if (m?.status == OrderTelegramMembershipStatus.left)
          const _Hint(text: 'Вы вышли из группы. Можно зайти заново.')
        else
          _PrimaryCta(
            label: _busy ? 'Готовим ссылку…' : ctaLabel,
            onTap: disabled ? null : () => _onCta(linkState),
          ),
      ],
    );
  }

  String _ctaLabel(bool orderActive, OrderTelegramMembership? m) {
    if (!orderActive) return 'Доступ закрыт';
    final linked = ref.read(telegramLinkProvider).value;
    if (linked == null || !linked.linked) {
      return 'Связать Telegram и войти';
    }
    if (m?.status == OrderTelegramMembershipStatus.joined) {
      return 'Открыть в Telegram';
    }
    return 'Открыть в Telegram';
  }

  Future<void> _onCta(AsyncValue<dynamic> linkState) async {
    final linked = linkState.value;
    if (linked == null) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      // Branch 1: user not linked → start the linking flow.
      if (!(linked.linked as bool)) {
        await _startLinkingFlow();
        return;
      }
      // Branch 2: user joined and we know a public username → straight to chat.
      final group = widget.item.telegramGroup!;
      final m = widget.item.telegramMembership;
      if (m?.status == OrderTelegramMembershipStatus.joined &&
          group.inviteUsername != null) {
        await _open('https://t.me/${group.inviteUsername}');
        return;
      }
      // Branch 3: pending or joined-but-private → request invite link.
      try {
        final url = await ref
            .read(clientOrderDetailProvider(widget.orderId).notifier)
            .requestTelegramInvite(widget.item.id);
        await _open(url);
      } on TelegramInviteException catch (e) {
        if (e.code == 'telegram_not_linked') {
          // Race: link state stale. Re-link.
          await _startLinkingFlow();
          return;
        }
        messenger.showSnackBar(
          SnackBar(content: Text(_friendlyInviteError(e.code))),
        );
      }
    } on NetworkException {
      messenger.showSnackBar(
        const SnackBar(content: Text('Нет соединения с сервером')),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Не удалось открыть Telegram')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _startLinkingFlow() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final token = await ref
          .read(telegramLinkProvider.notifier)
          .requestLinkToken();
      await _open(token.deepLink);
      // Refresh link state when the user comes back; chat_member events on the
      // bot side update telegram_user_id asynchronously, so a couple of taps
      // may be needed before /me/telegram returns linked=true.
      await ref.read(telegramLinkProvider.notifier).refresh();
      await ref
          .read(clientOrderDetailProvider(widget.orderId).notifier)
          .refresh();
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Не удалось сгенерировать ссылку')),
      );
    }
  }

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    final ok =
        await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) {
      throw Exception('launch_failed');
    }
  }
}

String _friendlyInviteError(String code) {
  switch (code) {
    case 'telegram_not_linked':
      return 'Сначала свяжите Telegram.';
    case 'membership_inactive':
      return 'Доступ к группе уже закрыт.';
    case 'invite_unavailable':
      return 'Не удалось получить инвайт. Свяжитесь с менеджером.';
    default:
      return 'Не удалось получить инвайт.';
  }
}

// ----- plain (non-bookable, non-telegram) -----

class _PlainBlock extends StatelessWidget {
  final ClientOrderDetailItem item;

  const _PlainBlock({required this.item});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoRow(
          label: 'Цена',
          value: '${formatOrderTenge(num.parse(item.unitPriceTenge))} ₸',
        ),
        if (item.expiresAt != null)
          _InfoRow(
            label: 'Доступ до',
            value: formatOrderDate(item.expiresAt!),
          ),
      ],
    );
  }
}

// ----- shared -----

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.greyMedium,
                fontSize: 13,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: AppColors.greyDark,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PrimaryCta extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;

  const _PrimaryCta({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.purplePrimary,
          foregroundColor: Colors.white,
          disabledBackgroundColor:
              AppColors.purpleTertiary.withValues(alpha: 0.6),
          disabledForegroundColor: Colors.white70,
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          elevation: 0,
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  final String text;

  const _Hint({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.greyLighter,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: const TextStyle(color: AppColors.greyDark, fontSize: 13),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            style: const TextStyle(color: AppColors.greyDark, fontSize: 14),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: onRetry,
            child: const Text(
              'Повторить',
              style: TextStyle(color: AppColors.purplePrimary),
            ),
          ),
        ],
      ),
    );
  }
}
