import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_provider.dart';
import 'courses_api.dart';

final coursesApiProvider = Provider<CoursesApi>(
  (ref) => CoursesApi(ref.watch(apiClientProvider)),
);
