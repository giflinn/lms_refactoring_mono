/// Passed via go_router `extra` to the card checkout page. The order is already
/// created (POST /orders) and a payment attempt started (POST /payments) before
/// navigating here.
class CardCheckoutArgs {
  final String orderId;
  final String paymentId;
  final String checkoutUrl;
  final String returnUrl;

  const CardCheckoutArgs({
    required this.orderId,
    required this.paymentId,
    required this.checkoutUrl,
    required this.returnUrl,
  });
}
