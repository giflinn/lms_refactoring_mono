import 'dart:convert';
import 'dart:io';
import '../../../core/network/api_client.dart';
import '../domain/course.dart';

class CoursesApi {
  final ApiClient _client;

  CoursesApi(this._client);

  /// GET /me/courses/:id — full module + lesson tree (no lesson HTML).
  Future<CourseDetail> getCourse({
    required String courseId,
    required String idToken,
  }) async {
    final res = await _client.get('/me/courses/$courseId', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /me/courses/$courseId: ${res.statusCode}');
    }
    return CourseDetail.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// GET /me/lessons/:id — full content (HTML body).
  Future<LessonContent> getLesson({
    required String lessonId,
    required String idToken,
  }) async {
    final res = await _client.get('/me/lessons/$lessonId', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /me/lessons/$lessonId: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return LessonContent.fromJson(json['lesson'] as Map<String, dynamic>);
  }
}
