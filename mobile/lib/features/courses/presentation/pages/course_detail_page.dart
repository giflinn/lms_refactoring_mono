import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../../core/widgets/gradient_background.dart';
import '../../domain/course.dart';
import '../controller/course_detail_controller.dart';
import '../widgets/screen_protected.dart';

/// Доступ к курсу через активный заказ → жёлтая кнопка "Открыть курс" в
/// деталях заказа открывает эту страницу. Здесь — обложка + описание +
/// раскрывающийся список модулей с уроками.
class CourseDetailPage extends ConsumerWidget {
  final String courseId;

  const CourseDetailPage({super.key, required this.courseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(courseDetailProvider(courseId));
    return ScreenProtected(
      child: GradientBackground(
        child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Column(
            children: [
              const _NavBar(title: 'Курс'),
              Expanded(
                child: state.when(
                  loading: () => const _Loading(),
                  error: (err, _) => _ErrorView(
                    message: err is NetworkException
                        ? 'Нет соединения с сервером'
                        : 'Не удалось загрузить курс',
                    onRetry: () => ref
                        .read(courseDetailProvider(courseId).notifier)
                        .refresh(),
                  ),
                  data: (data) => RefreshIndicator(
                    color: AppColors.purplePrimary,
                    onRefresh: () => ref
                        .read(courseDetailProvider(courseId).notifier)
                        .refresh(),
                    child: _Body(data: data, courseId: courseId),
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

class _Body extends StatelessWidget {
  final CourseDetail data;
  final String courseId;

  const _Body({required this.data, required this.courseId});

  @override
  Widget build(BuildContext context) {
    final c = data.course;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        _CoverCard(
          title: c.title,
          description: c.description,
          coverImageUrl: c.coverImageUrl,
        ),
        const SizedBox(height: 16),
        if (data.modules.isEmpty)
          const _Empty()
        else
          for (final m in data.modules) ...[
            _ModuleCard(courseId: courseId, module: m),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _CoverCard extends StatelessWidget {
  final String title;
  final String? description;
  final String? coverImageUrl;

  const _CoverCard({
    required this.title,
    required this.description,
    required this.coverImageUrl,
  });

  @override
  Widget build(BuildContext context) {
    final base = ApiClient.resolveBaseUrl();
    final src = coverImageUrl == null
        ? null
        : (coverImageUrl!.startsWith('/')
            ? '$base$coverImageUrl'
            : coverImageUrl!);
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.18)),
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (src != null)
            AspectRatio(
              aspectRatio: 16 / 9,
              child: CachedNetworkImage(
                imageUrl: src,
                fit: BoxFit.cover,
                placeholder: (_, _) => Container(color: Colors.black26),
                errorWidget: (_, _, _) => Container(color: Colors.black26),
              ),
            )
          else
            const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    height: 1.25,
                    letterSpacing: -0.4,
                  ),
                ),
                if (description != null && description!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    description!,
                    style: TextStyle(
                      color: AppColors.white.withValues(alpha: 0.85),
                      fontSize: 14,
                      height: 1.45,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ModuleCard extends StatefulWidget {
  final String courseId;
  final CourseModule module;

  const _ModuleCard({required this.courseId, required this.module});

  @override
  State<_ModuleCard> createState() => _ModuleCardState();
}

class _ModuleCardState extends State<_ModuleCard> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    final m = widget.module;
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      m.title,
                      style: const TextStyle(
                        color: AppColors.greyDark,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    '${m.lessons.length} ур.',
                    style: const TextStyle(
                      color: AppColors.greyMedium,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(width: 8),
                  AnimatedRotation(
                    turns: _expanded ? 0.5 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: const Icon(
                      Icons.keyboard_arrow_down,
                      color: AppColors.greyMedium,
                      size: 22,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_expanded && m.lessons.isNotEmpty)
            ...m.lessons.map((l) => _LessonRow(courseId: widget.courseId, lesson: l)),
          if (_expanded && m.lessons.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text(
                'В модуле пока нет уроков.',
                style: TextStyle(color: AppColors.greyMedium, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }
}

class _LessonRow extends StatelessWidget {
  final String courseId;
  final CourseLessonSummary lesson;

  const _LessonRow({required this.courseId, required this.lesson});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () =>
          context.push('/client/courses/$courseId/lessons/${lesson.id}'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: AppColors.purpleTertiary.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.play_arrow_rounded,
                color: AppColors.purplePrimary,
                size: 18,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                lesson.title,
                style: const TextStyle(
                  color: AppColors.greyDark,
                  fontSize: 14,
                ),
              ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              color: AppColors.greyMedium,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.18)),
      ),
      child: Center(
        child: Text(
          'В курсе пока нет модулей',
          style: TextStyle(
            color: AppColors.white.withValues(alpha: 0.85),
            fontSize: 14,
          ),
        ),
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white),
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
