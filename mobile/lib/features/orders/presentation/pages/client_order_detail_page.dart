import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../telegram/presentation/controller/telegram_link_controller.dart';
import '../../data/orders_api.dart' show TelegramInviteException;
import '../../domain/order.dart';
import '../controller/client_order_detail_controller.dart';
import 'my_purchases_page.dart' show ChatPrefill;

/// Per-order detail screen. One section per item, rendered directly on the
/// purple gradient (no white cards) — large title, optional subtitle,
/// description block, type-specific facts and the right CTA:
///   - Booking item   → date / duration + "Связаться с менеджером"
///   - Telegram item  → group info + state-driven CTA
///   - LMS item       → "Открыть курс" → /client/courses/:id
///   - Plain item     → expiry only, no CTA
class ClientOrderDetailPage extends ConsumerWidget {
  final String orderId;

  const ClientOrderDetailPage({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(clientOrderDetailProvider(orderId));
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Column(
            children: [
              _NavBar(
                title: state.maybeWhen(
                  data: (o) => '№${o.orderNumber}',
                  orElse: () => 'Заказ',
                ),
              ),
              Expanded(
                child: state.when(
                  loading: () => const Center(
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.white,
                    ),
                  ),
                  error: (err, _) => _ErrorView(
                    message: err is NetworkException
                        ? 'Нет соединения с сервером'
                        : 'Не удалось загрузить заказ',
                    onRetry: () => ref
                        .read(clientOrderDetailProvider(orderId).notifier)
                        .refresh(),
                  ),
                  data: (order) => RefreshIndicator(
                    color: AppColors.purplePrimary,
                    onRefresh: () => ref
                        .read(clientOrderDetailProvider(orderId).notifier)
                        .refresh(),
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
                      children: [
                        _CompactOrderHeader(order: order),
                        const _SectionDivider(),
                        for (var i = 0; i < order.items.length; i++) ...[
                          _ItemSection(
                            orderId: orderId,
                            item: order.items[i],
                            order: order,
                          ),
                          if (i != order.items.length - 1)
                            const _SectionDivider(),
                        ],
                      ],
                    ),
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

class _CompactOrderHeader extends StatelessWidget {
  final ClientOrderDetail order;

  const _CompactOrderHeader({required this.order});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _StatusPill(status: order.status),
            Text(
              '${formatOrderTenge(order.totalTenge)} ₸',
              style: const TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.4,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          'Создан ${formatOrderDate(order.createdAt)}',
          style: const TextStyle(
            color: AppColors.purpleTertiary,
            fontSize: 13,
            letterSpacing: -0.2,
          ),
        ),
        if (order.manager != null) ...[
          const SizedBox(height: 2),
          Text(
            'Менеджер: ${order.manager!.fullName}',
            style: const TextStyle(
              color: AppColors.purpleTertiary,
              fontSize: 13,
              letterSpacing: -0.2,
            ),
          ),
        ],
      ],
    );
  }
}

class _StatusPill extends StatelessWidget {
  final OrderStatus status;

  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, fg, bg) = switch (status) {
      OrderStatus.newOrder =>
        ('Новый', AppColors.purplePrimary, AppColors.purpleTertiary),
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

class _SectionDivider extends StatelessWidget {
  const _SectionDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 20),
      height: 1,
      color: AppColors.white.withValues(alpha: 0.18),
    );
  }
}

class _ItemSection extends ConsumerWidget {
  final String orderId;
  final ClientOrderDetailItem item;
  final ClientOrderDetail order;

  const _ItemSection({
    required this.orderId,
    required this.item,
    required this.order,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          item.productCategoryName,
          style: const TextStyle(
            color: AppColors.purpleTertiary,
            fontSize: 13,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.2,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          item.productTitle,
          style: const TextStyle(
            color: AppColors.white,
            fontSize: 24,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.5,
            height: 1.15,
          ),
        ),
        if (item.productSubtitle != null && item.productSubtitle!.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            item.productSubtitle!,
            style: const TextStyle(
              color: AppColors.purpleTertiary,
              fontSize: 14,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.2,
            ),
          ),
        ],
        if (item.productDescription != null &&
            item.productDescription!.isNotEmpty) ...[
          const SizedBox(height: 16),
          const Text(
            'Описание',
            style: TextStyle(
              color: AppColors.white,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            item.productDescription!,
            style: const TextStyle(
              color: AppColors.purpleTertiary,
              fontSize: 14,
              height: 1.45,
              letterSpacing: -0.2,
            ),
          ),
        ],
        const SizedBox(height: 16),
        if (item.isBooking)
          _BookingBlock(item: item, order: order)
        else if (item.isTelegram)
          _TelegramBlock(orderId: orderId, item: item, order: order)
        else if (item.isLmsCourse)
          _LmsBlock(item: item, order: order)
        else
          _PlainBlock(item: item),
      ],
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
        if (dur != null) _InfoRow(label: 'Длительность', value: '$dur мин'),
        const SizedBox(height: 16),
        PrimaryButton(
          label: _opening ? 'Открываем чат…' : 'Связаться с менеджером',
          onPressed: _opening ? null : _openChat,
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

// ----- LMS variant -----

class _LmsBlock extends StatelessWidget {
  final ClientOrderDetailItem item;
  final ClientOrderDetail order;

  const _LmsBlock({required this.item, required this.order});

  @override
  Widget build(BuildContext context) {
    final c = item.lmsCourse!;
    final orderActive = order.status == OrderStatus.active;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (item.expiresAt != null)
          _InfoRow(
            label: 'Срок доступа',
            value: formatOrderDate(item.expiresAt!),
          ),
        const SizedBox(height: 16),
        if (!orderActive)
          const _Hint(text: 'Доступ к курсу закрыт.')
        else
          PrimaryButton(
            label: 'Открыть курс',
            onPressed: () => context.push('/client/courses/${c.id}'),
          ),
      ],
    );
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

    final ctaLabel = _ctaLabel(orderActive, m);
    final disabled = !orderActive ||
        (m != null && !m.isActive) ||
        _busy ||
        linkState.isLoading;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoRow(label: 'Тип', value: group.kindLabel),
        _InfoRow(label: 'Группа', value: group.title),
        if (widget.item.expiresAt != null)
          _InfoRow(
            label: 'Срок доступа',
            value: formatOrderDate(widget.item.expiresAt!),
          ),
        const SizedBox(height: 16),
        if (!orderActive)
          const _Hint(text: 'Доступ к группе закрыт.')
        else if (m?.status == OrderTelegramMembershipStatus.kicked)
          const _Hint(text: 'Вас удалили из группы. Свяжитесь с менеджером.')
        else
          PrimaryButton(
            label: _busy ? 'Готовим ссылку…' : ctaLabel,
            onPressed: disabled ? null : () => _onCta(linkState),
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
      if (!(linked.linked as bool)) {
        await _startLinkingFlow();
        return;
      }
      final group = widget.item.telegramGroup!;
      final m = widget.item.telegramMembership;
      if (m?.status == OrderTelegramMembershipStatus.joined &&
          group.inviteUsername != null) {
        await _open('https://t.me/${group.inviteUsername}');
        return;
      }
      try {
        final url = await ref
            .read(clientOrderDetailProvider(widget.orderId).notifier)
            .requestTelegramInvite(widget.item.id);
        await _open(url);
      } on TelegramInviteException catch (e) {
        if (e.code == 'telegram_not_linked') {
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
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
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

// ----- plain (non-bookable, non-telegram, non-lms) -----

class _PlainBlock extends StatelessWidget {
  final ClientOrderDetailItem item;

  const _PlainBlock({required this.item});

  @override
  Widget build(BuildContext context) {
    if (item.expiresAt == null) return const SizedBox.shrink();
    return _InfoRow(
      label: 'Срок доступа',
      value: formatOrderDate(item.expiresAt!),
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
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.purpleTertiary,
                fontSize: 14,
                letterSpacing: -0.2,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: AppColors.white,
                fontSize: 14,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.2,
              ),
            ),
          ),
        ],
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: AppColors.white.withValues(alpha: 0.9),
          fontSize: 14,
          letterSpacing: -0.2,
        ),
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
        ),
      ),
    );
  }
}
