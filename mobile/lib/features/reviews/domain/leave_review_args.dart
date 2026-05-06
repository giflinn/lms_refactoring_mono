/// Arguments for the `/client/reviews/leave` route. When [reviewId] is null
/// the page is in "submit new" mode (calls POST /me/reviews); when non-null
/// it's "edit existing" mode (calls PATCH /me/reviews/:id) and the page
/// pre-fills the form with [initialRating] / [initialText].
class LeaveReviewArgs {
  final String productId;
  final String productTitle;
  final String? reviewId;
  final int? initialRating;
  final String? initialText;

  const LeaveReviewArgs({
    required this.productId,
    required this.productTitle,
    this.reviewId,
    this.initialRating,
    this.initialText,
  });

  bool get isEdit => reviewId != null;
}
