import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../../core/widgets/gradient_background.dart';
import '../controller/lesson_controller.dart';
import '../widgets/lesson_html.dart';
import '../widgets/screen_protected.dart';

/// Lesson reading page. Gradient nav bar on top (consistent with the rest of
/// the cabinet) but the content area drops to a white card so long HTML is
/// readable.
class LessonPage extends ConsumerWidget {
  final String courseId;
  final String lessonId;

  const LessonPage({
    super.key,
    required this.courseId,
    required this.lessonId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(lessonProvider(lessonId));
    return ScreenProtected(
      child: GradientBackground(
        child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Column(
            children: [
              _NavBar(
                title: state.maybeWhen(
                  data: (l) => l.title,
                  orElse: () => 'Урок',
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
                        : 'Не удалось загрузить урок',
                    onRetry: () =>
                        ref.read(lessonProvider(lessonId).notifier).refresh(),
                  ),
                  data: (lesson) => RefreshIndicator(
                    color: AppColors.purplePrimary,
                    onRefresh: () =>
                        ref.read(lessonProvider(lessonId).notifier).refresh(),
                    child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.white,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              lesson.title,
                              style: const TextStyle(
                                color: AppColors.greyDark,
                                fontSize: 20,
                                fontWeight: FontWeight.w600,
                                height: 1.3,
                              ),
                            ),
                            const SizedBox(height: 12),
                            if (lesson.contentHtml.isEmpty)
                              const Text(
                                'Контент пока не добавлен.',
                                style: TextStyle(
                                  color: AppColors.greyMedium,
                                  fontSize: 14,
                                ),
                              )
                            else
                              LessonHtml(html: lesson.contentHtml),
                          ],
                        ),
                      ),
                    ),
                  ),
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
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 56),
            child: Center(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -0.4,
                ),
              ),
            ),
          ),
        ],
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
