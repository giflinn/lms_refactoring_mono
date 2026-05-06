/// Slim course summary used for the "Мои курсы" tab in cabinet (eventually)
/// and as the tree root on the course-detail page.
class CourseSummary {
  final String id;
  final String title;
  final String? description;
  final String? coverImageUrl;

  const CourseSummary({
    required this.id,
    required this.title,
    required this.description,
    required this.coverImageUrl,
  });

  factory CourseSummary.fromJson(Map<String, dynamic> json) {
    return CourseSummary(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      coverImageUrl: json['coverImageUrl'] as String?,
    );
  }
}

/// One lesson row inside a module, without the body. Body is fetched on
/// demand from /me/lessons/:id when the user opens the lesson page.
class CourseLessonSummary {
  final String id;
  final String title;
  final int sortOrder;

  const CourseLessonSummary({
    required this.id,
    required this.title,
    required this.sortOrder,
  });

  factory CourseLessonSummary.fromJson(Map<String, dynamic> json) {
    return CourseLessonSummary(
      id: json['id'] as String,
      title: json['title'] as String,
      sortOrder: (json['sortOrder'] as num).toInt(),
    );
  }
}

class CourseModule {
  final String id;
  final String title;
  final int sortOrder;
  final List<CourseLessonSummary> lessons;

  const CourseModule({
    required this.id,
    required this.title,
    required this.sortOrder,
    required this.lessons,
  });

  factory CourseModule.fromJson(Map<String, dynamic> json) {
    return CourseModule(
      id: json['id'] as String,
      title: json['title'] as String,
      sortOrder: (json['sortOrder'] as num).toInt(),
      lessons: (json['lessons'] as List<dynamic>?)
              ?.map(
                (e) => CourseLessonSummary.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
    );
  }
}

class CourseDetail {
  final CourseSummary course;
  final List<CourseModule> modules;

  const CourseDetail({required this.course, required this.modules});

  factory CourseDetail.fromJson(Map<String, dynamic> json) {
    return CourseDetail(
      course: CourseSummary.fromJson(json['course'] as Map<String, dynamic>),
      modules: (json['modules'] as List<dynamic>?)
              ?.map((e) => CourseModule.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }
}

class LessonContent {
  final String id;
  final String moduleId;
  final String courseId;
  final String title;
  final String contentHtml;

  const LessonContent({
    required this.id,
    required this.moduleId,
    required this.courseId,
    required this.title,
    required this.contentHtml,
  });

  factory LessonContent.fromJson(Map<String, dynamic> json) {
    return LessonContent(
      id: json['id'] as String,
      moduleId: json['moduleId'] as String,
      courseId: json['courseId'] as String,
      title: json['title'] as String,
      contentHtml: json['contentHtml'] as String,
    );
  }
}
