import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
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

  /// GET /me/lessons/:id — full content (HTML body + PDF attachment metadata).
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

  /// Downloads a PDF attachment into the app's temporary directory and
  /// returns the local path. The bearer token authorises the download (the
  /// /lms-attachments/* static mount is unauthenticated by design — leaking
  /// the URL is mitigated by the uuid-named file, but the *list* of urls is
  /// only returned to clients who own the course). We cache by attachment
  /// id so re-opening the same file doesn't re-download.
  Future<File> downloadAttachment({
    required String urlPath,
    required String attachmentId,
    required String idToken,
  }) async {
    final dir = await getTemporaryDirectory();
    final outDir = Directory('${dir.path}/lms-attachments');
    if (!outDir.existsSync()) {
      outDir.createSync(recursive: true);
    }
    final outFile = File('${outDir.path}/$attachmentId.pdf');
    if (outFile.existsSync() && outFile.lengthSync() > 0) {
      return outFile;
    }
    final res = await _client.get(urlPath, idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET $urlPath: ${res.statusCode}');
    }
    await outFile.writeAsBytes(res.bodyBytes, flush: true);
    return outFile;
  }
}
