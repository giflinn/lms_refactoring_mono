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

/// PDF material hung off a lesson. Rendered as a list under the HTML body
/// and opened in a screenshot-protected fullscreen viewer when tapped.
class LessonAttachment {
  final String id;
  final String fileName;
  final String mimeType;
  final int sizeBytes;
  final String urlPath;

  const LessonAttachment({
    required this.id,
    required this.fileName,
    required this.mimeType,
    required this.sizeBytes,
    required this.urlPath,
  });

  factory LessonAttachment.fromJson(Map<String, dynamic> json) {
    return LessonAttachment(
      id: json['id'] as String,
      fileName: json['fileName'] as String,
      mimeType: json['mimeType'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      urlPath: json['urlPath'] as String,
    );
  }
}

class LessonContent {
  final String id;
  final String moduleId;
  final String courseId;
  final String title;
  final String contentHtml;
  final List<LessonAttachment> attachments;

  const LessonContent({
    required this.id,
    required this.moduleId,
    required this.courseId,
    required this.title,
    required this.contentHtml,
    required this.attachments,
  });

  factory LessonContent.fromJson(Map<String, dynamic> json) {
    return LessonContent(
      id: json['id'] as String,
      moduleId: json['moduleId'] as String,
      courseId: json['courseId'] as String,
      title: json['title'] as String,
      contentHtml: json['contentHtml'] as String,
      attachments: (json['attachments'] as List<dynamic>?)
              ?.map(
                (e) => LessonAttachment.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
    );
  }
}
