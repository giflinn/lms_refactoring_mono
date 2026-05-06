import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/courses_api_provider.dart';
import '../../domain/course.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

class LessonController extends AsyncNotifier<LessonContent> {
  LessonController(this.lessonId);

  final String lessonId;

  @override
  Future<LessonContent> build() async {
    final token = await _idToken();
    return ref
        .read(coursesApiProvider)
        .getLesson(lessonId: lessonId, idToken: token);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final token = await _idToken();
      return ref
          .read(coursesApiProvider)
          .getLesson(lessonId: lessonId, idToken: token);
    });
  }
}

final lessonProvider = AsyncNotifierProvider.autoDispose
    .family<LessonController, LessonContent, String>(LessonController.new);
