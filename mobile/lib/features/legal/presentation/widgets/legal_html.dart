import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/design/tokens.dart';

/// Renders a legal document body. Tuned for the purple gradient background
/// (white text). External links open in the system browser; we don't expect
/// images or video in legal docs, so this widget is leaner than
/// `LessonHtml` (no media extensions).
class LegalHtml extends StatelessWidget {
  final String html;

  const LegalHtml({super.key, required this.html});

  @override
  Widget build(BuildContext context) {
    return Html(
      data: html,
      onLinkTap: (url, _, _) async {
        if (url == null) return;
        final uri = Uri.tryParse(url);
        if (uri == null) return;
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      },
      style: {
        'body': Style(
          color: AppColors.white,
          fontSize: FontSize(15),
          lineHeight: const LineHeight(1.55),
          margin: Margins.zero,
          padding: HtmlPaddings.zero,
        ),
        'h1': Style(
          color: AppColors.white,
          fontSize: FontSize(22),
          fontWeight: FontWeight.w600,
          margin: Margins.only(top: 4, bottom: 12),
        ),
        'h2': Style(
          color: AppColors.white,
          fontSize: FontSize(18),
          fontWeight: FontWeight.w600,
          margin: Margins.only(top: 16, bottom: 8),
        ),
        'h3': Style(
          color: AppColors.white,
          fontSize: FontSize(16),
          fontWeight: FontWeight.w600,
          margin: Margins.only(top: 12, bottom: 6),
        ),
        'p': Style(margin: Margins.symmetric(vertical: 6)),
        'li': Style(margin: Margins.symmetric(vertical: 2)),
        'a': Style(
          color: AppColors.yellowPrimary,
          textDecoration: TextDecoration.underline,
        ),
        'blockquote': Style(
          padding: HtmlPaddings.only(left: 12),
          margin: Margins.symmetric(vertical: 8),
          border: Border(
            left: BorderSide(
              color: AppColors.white.withValues(alpha: 0.4),
              width: 3,
            ),
          ),
          color: AppColors.white.withValues(alpha: 0.85),
          fontStyle: FontStyle.italic,
        ),
      },
    );
  }
}
