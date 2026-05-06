import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../cart/presentation/controller/cart_controller.dart';
import '../../../reviews/presentation/controller/product_reviews_controller.dart';
import '../../../reviews/presentation/widgets/public_review_card.dart';
import '../../domain/product.dart';
import '../controller/favorite_ids_controller.dart';
import '../widgets/product_action_bar.dart';
import '../widgets/product_booking_section.dart';
import '../widgets/product_cover.dart';
import '../widgets/product_video.dart';

/// Product detail screen. Composes:
///   Top bar : back arrow (left), heart toggle (right) — both white.
///   Body    : cover image, title, optional booking section, description.
///   Bottom  : pinned action bar with subtitle + price + CTA.
///
/// The page expects [product] in the route's `extra`. State for the booking
/// flow (selected month / day / start) lives here so the action bar can react
/// to the same selection without prop-drilling another controller.
class ProductDetailPage extends ConsumerStatefulWidget {
  final Product product;
  const ProductDetailPage({super.key, required this.product});

  @override
  ConsumerState<ProductDetailPage> createState() => _ProductDetailPageState();
}

class _ProductDetailPageState extends ConsumerState<ProductDetailPage> {
  late DateTime _selectedMonth; // local first-of-month at 00:00
  DateTime? _selectedDay; // local midnight of the picked day
  AvailableStart? _selectedStart;
  bool _termsAccepted = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _selectedMonth = DateTime(now.year, now.month, 1);

    // If the product is already in the cart with a booked start, restore the
    // month/day/time selection so the user lands on the slot they picked.
    // The reconstructed AvailableStart matches by `startsAt` (compared via
    // `isAtSameMomentAs` in BookingTimeStrip) so the time pill highlights as
    // soon as the slots load for that month.
    final inCart = ref
        .read(cartProvider)
        .where((it) => it.productId == widget.product.id)
        .toList();
    final booked = inCart.isEmpty ? null : inCart.first.bookedStart;
    final dur = widget.product.durationMinutes;
    if (booked != null && dur != null) {
      final local = booked.toLocal();
      _selectedMonth = DateTime(local.year, local.month, 1);
      _selectedDay = DateTime(local.year, local.month, local.day);
      _selectedStart = AvailableStart(
        startsAt: booked,
        endsAt: booked.add(Duration(minutes: dur)),
      );
    }
  }

  void _onMonthPicked(DateTime month) {
    setState(() {
      _selectedMonth = month;
      _selectedDay = null;
      _selectedStart = null;
    });
  }

  void _onDayPicked(DateTime day) {
    setState(() {
      _selectedDay = day;
      _selectedStart = null;
    });
  }

  void _onStartPicked(AvailableStart start) {
    setState(() {
      _selectedStart = start;
    });
  }

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              _TopBar(productId: widget.product.id),
              Expanded(
                child: _Body(
                  product: widget.product,
                  selectedMonth: _selectedMonth,
                  selectedDay: _selectedDay,
                  selectedStart: _selectedStart,
                  onMonthPicked: _onMonthPicked,
                  onDayPicked: _onDayPicked,
                  onStartPicked: _onStartPicked,
                ),
              ),
              ProductActionBar(
                product: widget.product,
                selectedStart: _selectedStart,
                termsAccepted: _termsAccepted,
                onTermsChanged: (v) => setState(() => _termsAccepted = v),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TopBar extends ConsumerWidget {
  final String productId;
  const _TopBar({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // .value is nullable — while the favorites set is loading we want the
    // heart to render outlined (the user hasn't favorited anything yet from
    // this view), not delay the UI.
    final ids = ref.watch(favoriteIdsProvider).value;
    final isFav = ids != null && ids.contains(productId);

    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 8, 4),
      child: Row(
        children: [
          IconButton(
            onPressed: () => context.pop(),
            icon: const Icon(
              Icons.arrow_back_ios_new,
              color: AppColors.white,
              size: 20,
            ),
            tooltip: 'Назад',
          ),
          const Spacer(),
          IconButton(
            onPressed: () => _onToggle(context, ref),
            icon: SvgPicture.asset(
              isFav
                  ? 'assets/icons/nav/favorites_active.svg'
                  : 'assets/icons/nav/favorites_inactive.svg',
              width: 24,
              height: 24,
              colorFilter: const ColorFilter.mode(
                AppColors.white,
                BlendMode.srcIn,
              ),
            ),
            tooltip: isFav ? 'Убрать из избранного' : 'В избранное',
          ),
        ],
      ),
    );
  }

  Future<void> _onToggle(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(favoriteIdsProvider.notifier).toggle(productId);
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось обновить избранное')),
      );
    }
  }
}

class _Body extends StatelessWidget {
  final Product product;
  final DateTime selectedMonth;
  final DateTime? selectedDay;
  final AvailableStart? selectedStart;
  final ValueChanged<DateTime> onMonthPicked;
  final ValueChanged<DateTime> onDayPicked;
  final ValueChanged<AvailableStart> onStartPicked;

  const _Body({
    required this.product,
    required this.selectedMonth,
    required this.selectedDay,
    required this.selectedStart,
    required this.onMonthPicked,
    required this.onDayPicked,
    required this.onStartPicked,
  });

  @override
  Widget build(BuildContext context) {
    final hasDescription = product.description.trim().isNotEmpty;
    // Hero block at the top: video replaces cover when display=replace, sits
    // below it when display=below, falls through to plain cover otherwise.
    final hero = _buildHero();
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          hero,
          const SizedBox(height: 16),
          Text(
            product.title,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 28,
              fontWeight: FontWeight.w500,
              height: 1.2,
              letterSpacing: -0.4,
            ),
          ),
          // Description above slots — slots are a long interactive widget;
          // putting the descriptive text first lets readers know what they're
          // booking before they pick a time.
          if (hasDescription) ...[
            const SizedBox(height: 16),
            const Text(
              'Описание',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                height: 1.3,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              product.description,
              style: const TextStyle(
                color: AppColors.purpleTertiary,
                fontSize: 15,
                fontWeight: FontWeight.w500,
                height: 1.34,
                letterSpacing: -0.4,
              ),
            ),
          ],
          if (product.isBookable) ...[
            const SizedBox(height: 16),
            ProductBookingSection(
              product: product,
              selectedMonth: selectedMonth,
              selectedDay: selectedDay,
              selectedStart: selectedStart,
              onMonthPicked: onMonthPicked,
              onDayPicked: onDayPicked,
              onStartPicked: onStartPicked,
            ),
          ],
          const SizedBox(height: 24),
          _ReviewsSnippet(productId: product.id),
        ],
      ),
    );
  }

  Widget _buildHero() {
    if (!product.hasVideo || product.videoSource == null) {
      return ProductCover(product: product);
    }
    if (product.videoDisplay == ProductVideoDisplay.replace) {
      return ProductVideo(product: product);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProductCover(product: product),
        const SizedBox(height: 12),
        ProductVideo(product: product),
      ],
    );
  }
}

/// First 3 published reviews + a link to the full list. Skipped while
/// loading and when the product has no reviews — keeping the page short for
/// brand-new products. The full list lives at `/client/products/:id/reviews`.
class _ReviewsSnippet extends ConsumerWidget {
  final String productId;
  const _ReviewsSnippet({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(productReviewsProvider(productId));
    if (state.loadingFirst || state.error != null) {
      return const SizedBox.shrink();
    }
    if (state.reviews.isEmpty) {
      return const SizedBox.shrink();
    }
    final preview = state.reviews.take(3).toList();
    final hasMore = state.reviews.length > preview.length || !state.reachedEnd;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Отзывы',
          style: TextStyle(
            color: AppColors.white,
            fontSize: 17,
            fontWeight: FontWeight.w500,
            height: 1.3,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < preview.length; i++) ...[
          PublicReviewCard(review: preview[i]),
          if (i < preview.length - 1) const SizedBox(height: 12),
        ],
        if (hasMore) ...[
          const SizedBox(height: 12),
          _AllReviewsLink(productId: productId),
        ],
      ],
    );
  }
}

class _AllReviewsLink extends StatelessWidget {
  final String productId;
  const _AllReviewsLink({required this.productId});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/client/products/$productId/reviews'),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Все отзывы',
                style: TextStyle(
                  color: AppColors.white.withValues(alpha: 0.85),
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.chevron_right_rounded,
                color: AppColors.white.withValues(alpha: 0.85),
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
