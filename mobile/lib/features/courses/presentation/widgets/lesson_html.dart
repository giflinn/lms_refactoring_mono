import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_client.dart';
import 'lesson_video.dart';

/// Renders the lesson's authored HTML body. Pre-processes relative
/// /lms-media and /lms-covers URLs to absolute backend URLs and wires a
/// custom <video> extension to embed the chewie player.
class LessonHtml extends StatelessWidget {
  final String html;

  const LessonHtml({super.key, required this.html});

  @override
  Widget build(BuildContext context) {
    final base = ApiClient.resolveBaseUrl();
    return Html(
      data: html,
      onLinkTap: (url, _, _) {
        // Links open inside the system browser via url_launcher; we don't
        // wire it here because lessons rarely link out and the surrounding
        // page already hooks url_launcher for the LMS CTA.
        debugPrint('lesson link tap: $url');
      },
      style: {
        'body': Style(
          color: AppColors.greyDark,
          fontSize: FontSize(15),
          lineHeight: const LineHeight(1.55),
          margin: Margins.zero,
          padding: HtmlPaddings.zero,
        ),
        'h1': Style(
          color: AppColors.greyDark,
          fontSize: FontSize(22),
          fontWeight: FontWeight.w600,
          margin: Margins.symmetric(vertical: 12),
        ),
        'h2': Style(
          color: AppColors.greyDark,
          fontSize: FontSize(18),
          fontWeight: FontWeight.w600,
          margin: Margins.symmetric(vertical: 10),
        ),
        'h3': Style(
          color: AppColors.greyDark,
          fontSize: FontSize(16),
          fontWeight: FontWeight.w600,
          margin: Margins.symmetric(vertical: 8),
        ),
        'p': Style(margin: Margins.symmetric(vertical: 6)),
        'a': Style(color: AppColors.purplePrimary),
        'blockquote': Style(
          padding: HtmlPaddings.only(left: 12),
          margin: Margins.symmetric(vertical: 8),
          border: const Border(
            left: BorderSide(color: AppColors.purpleTertiary, width: 3),
          ),
          color: AppColors.greyMedium,
          fontStyle: FontStyle.italic,
        ),
        'img': Style(
          width: Width(100, Unit.percent),
          margin: Margins.symmetric(vertical: 8),
        ),
      },
      extensions: [
        _RelativeUrlExtension(base),
        _VideoExtension(base),
      ],
    );
  }
}

// Rewrites relative `src` attributes (`/lms-media/...`, `/lms-covers/...`) to
// absolute URLs so flutter_html's default <img> renderer can fetch them.
class _RelativeUrlExtension extends HtmlExtension {
  final String baseUrl;
  const _RelativeUrlExtension(this.baseUrl);

  @override
  Set<String> get supportedTags => const {'img'};

  @override
  bool matches(ExtensionContext context) {
    if (context.elementName != 'img') return false;
    final src = context.attributes['src'];
    return src != null && src.startsWith('/');
  }

  @override
  InlineSpan build(ExtensionContext context) {
    final src = context.attributes['src'];
    final resolved = src != null && src.startsWith('/')
        ? '$baseUrl$src'
        : src ?? '';
    return WidgetSpan(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            resolved,
            fit: BoxFit.cover,
            loadingBuilder: (context, child, progress) =>
                progress == null ? child : const _Skeleton(),
            errorBuilder: (_, _, _) => const _Skeleton(failed: true),
          ),
        ),
      ),
    );
  }
}

class _VideoExtension extends HtmlExtension {
  final String baseUrl;
  const _VideoExtension(this.baseUrl);

  @override
  Set<String> get supportedTags => const {'video'};

  @override
  bool matches(ExtensionContext context) => context.elementName == 'video';

  @override
  InlineSpan build(ExtensionContext context) {
    final src = context.attributes['src'] ?? '';
    final resolved = src.startsWith('/') ? '$baseUrl$src' : src;
    if (resolved.isEmpty) {
      return const TextSpan();
    }
    return WidgetSpan(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: LessonVideo(src: resolved),
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  final bool failed;
  const _Skeleton({this.failed = false});

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 16 / 9,
      child: Container(
        color: Colors.black12,
        alignment: Alignment.center,
        child: failed
            ? const Text(
                'Не удалось загрузить',
                style: TextStyle(color: AppColors.greyDark, fontSize: 13),
              )
            : const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.purplePrimary,
                ),
              ),
      ),
    );
  }
}
