import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart';
import '../../data/bcc_payment_api.dart';
import '../../data/bcc_payment_api_provider.dart';
import '../../domain/card_checkout_args.dart';

/// Hosts the BCC card-entry + 3DS page in a WebView. When the bank redirects to
/// BACKREF we stop the WebView and poll GET /payments/:id until the backend
/// settles (the verified callback / TRTYPE=90 — never the redirect itself).
/// docs/bcc-payment-integration.md §5/§9.
enum _Phase { paying, checking, success, failed }

class CardCheckoutPage extends ConsumerStatefulWidget {
  final CardCheckoutArgs args;
  const CardCheckoutPage({super.key, required this.args});

  @override
  ConsumerState<CardCheckoutPage> createState() => _CardCheckoutPageState();
}

class _CardCheckoutPageState extends ConsumerState<CardCheckoutPage> {
  late final WebViewController _controller;
  _Phase _phase = _Phase.paying;
  // True while the WebView is loading a page — the bank's 3DS page can take a
  // few seconds, so we show a spinner over the (otherwise blank) WebView.
  bool _webLoading = true;
  late String _paymentId;
  late String _returnUrl;
  String? _message;

  @override
  void initState() {
    super.initState();
    _paymentId = widget.args.paymentId;
    _returnUrl = widget.args.returnUrl;
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _webLoading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _webLoading = false);
          },
          onWebResourceError: (e) {
            // A failed main-frame load must not leave the spinner forever.
            if ((e.isForMainFrame ?? false) && mounted) {
              setState(() => _webLoading = false);
            }
          },
          onNavigationRequest: (req) {
            if (req.url.startsWith(_returnUrl)) {
              // Bank flow finished — don't actually load our return URL in the
              // WebView; switch to polling instead.
              unawaited(_onReturned());
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      );
    unawaited(_loadCheckout(widget.args.checkoutUrl));
  }

  /// Clears any cached BCC session (cookies / cache / local storage) before
  /// loading a fresh checkout. A stale 3DS/session left over from a prior
  /// failed attempt can make the bank page misbehave — BCC support's fix is
  /// literally "очистите кэш и попробуйте ещё раз", so we do it on every load.
  Future<void> _loadCheckout(String url) async {
    if (mounted) setState(() => _webLoading = true);
    // Best-effort clear — never let a clear failure block the checkout load.
    try {
      await WebViewCookieManager().clearCookies();
      await _controller.clearCache();
      await _controller.clearLocalStorage();
    } catch (_) {
      // ignore — clearing is a nicety, the load is what matters
    }
    await _controller.loadRequest(Uri.parse(url));
  }

  Future<String?> _idToken() =>
      FirebaseAuth.instance.currentUser?.getIdToken() ?? Future.value(null);

  Future<void> _onReturned() async {
    if (_phase != _Phase.paying) return;
    setState(() => _phase = _Phase.checking);
    // Poll a few times — the callback usually settles within a couple seconds.
    for (var i = 0; i < 8; i++) {
      try {
        final token = await _idToken();
        if (token == null) break;
        final r = await ref
            .read(bccPaymentApiProvider)
            .status(paymentId: _paymentId, idToken: token);
        if (r.isPaid) {
          if (mounted) setState(() => _phase = _Phase.success);
          return;
        }
        if (r.isFailed) {
          if (mounted) {
            setState(() {
              _phase = _Phase.failed;
              _message = (r.rcText != null && r.rcText!.isNotEmpty)
                  ? r.rcText
                  : 'Оплата не прошла. Попробуйте ещё раз.';
            });
          }
          return;
        }
      } catch (_) {
        // Keep polling — a transient error shouldn't end the flow early.
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    // Still pending after the window — likely a delayed callback. Don't claim
    // failure; tell the user to check their orders shortly.
    if (mounted) {
      setState(() {
        _phase = _Phase.failed;
        _message =
            'Платёж обрабатывается. Проверьте статус заказа в «Мои покупки» '
            'через пару минут.';
      });
    }
  }

  Future<void> _retry() async {
    setState(() {
      _phase = _Phase.paying;
      _message = null;
    });
    try {
      final token = await _idToken();
      if (token == null) {
        _fail('Войдите в аккаунт, чтобы продолжить');
        return;
      }
      final started = await ref
          .read(bccPaymentApiProvider)
          .start(orderId: widget.args.orderId, idToken: token);
      _paymentId = started.paymentId;
      _returnUrl = started.returnUrl;
      await _loadCheckout(started.checkoutUrl);
    } on PaymentException catch (e) {
      _fail(_startErrorMessage(e.code));
    } on NetworkException {
      _fail('Нет соединения с сервером');
    }
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _phase = _Phase.failed;
      _message = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Оплата картой')),
      body: switch (_phase) {
        _Phase.paying => Stack(
          children: [
            WebViewWidget(controller: _controller),
            if (_webLoading)
              const Positioned.fill(
                child: ColoredBox(
                  color: AppColors.white,
                  child: _Centered(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(
                          color: AppColors.purplePrimary,
                        ),
                        SizedBox(height: 16),
                        Text('Загружаем страницу оплаты…', style: _hintStyle),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
        _Phase.checking => const _Centered(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(color: AppColors.purplePrimary),
              SizedBox(height: 16),
              Text('Проверяем оплату…', style: _hintStyle),
            ],
          ),
        ),
        _Phase.success => _ResultView(
          icon: Icons.check_circle_outline,
          iconColor: AppColors.purplePrimary,
          title: 'Оплата прошла',
          message: 'Заказ оплачен. Доступ откроется в течение пары минут.',
          primaryLabel: 'Мои покупки',
          onPrimary: () => context.go('/client/purchases'),
          secondaryLabel: 'На главную',
          onSecondary: () => context.go('/home'),
        ),
        _Phase.failed => _ResultView(
          icon: Icons.error_outline,
          iconColor: AppColors.redError,
          title: 'Оплата не завершена',
          message: _message ?? 'Что-то пошло не так. Попробуйте ещё раз.',
          primaryLabel: 'Повторить',
          onPrimary: _retry,
          secondaryLabel: 'Мои покупки',
          onSecondary: () => context.go('/client/purchases'),
        ),
      },
    );
  }
}

String _startErrorMessage(String code) {
  switch (code) {
    case 'order_not_payable':
      return 'Этот заказ уже оплачен или отменён.';
    case 'payment_unavailable':
      return 'Оплата картой временно недоступна. Попробуйте Kaspi.';
    case 'order_not_found':
      return 'Заказ не найден.';
    default:
      return 'Не удалось начать оплату. Попробуйте позже.';
  }
}

const _hintStyle = TextStyle(
  color: AppColors.greyMedium,
  fontSize: 14,
  fontWeight: FontWeight.w500,
);

class _Centered extends StatelessWidget {
  final Widget child;
  const _Centered({required this.child});

  @override
  Widget build(BuildContext context) =>
      Center(child: Padding(padding: const EdgeInsets.all(24), child: child));
}

class _ResultView extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String message;
  final String primaryLabel;
  final VoidCallback onPrimary;
  final String secondaryLabel;
  final VoidCallback onSecondary;

  const _ResultView({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.message,
    required this.primaryLabel,
    required this.onPrimary,
    required this.secondaryLabel,
    required this.onSecondary,
  });

  @override
  Widget build(BuildContext context) {
    return _Centered(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: iconColor, size: 64),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.purpleDark,
              fontSize: 20,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center, style: _hintStyle),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.purplePrimary,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: onPrimary,
              child: Text(primaryLabel),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: onSecondary,
              child: Text(
                secondaryLabel,
                style: const TextStyle(color: AppColors.purplePrimary),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
