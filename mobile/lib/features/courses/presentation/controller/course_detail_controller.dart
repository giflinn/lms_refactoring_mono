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

class CourseDetailController extends AsyncNotifier<CourseDetail> {
  CourseDetailController(this.courseId);

  final String courseId;

  @override
  Future<CourseDetail> build() async {
    final token = await _idToken();
    return ref
        .read(coursesApiProvider)
        .getCourse(courseId: courseId, idToken: token);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final token = await _idToken();
      return ref
          .read(coursesApiProvider)
          .getCourse(courseId: courseId, idToken: token);
    });
  }
}

final courseDetailProvider = AsyncNotifierProvider.autoDispose
    .family<CourseDetailController, CourseDetail, String>(
  CourseDetailController.new,
);
