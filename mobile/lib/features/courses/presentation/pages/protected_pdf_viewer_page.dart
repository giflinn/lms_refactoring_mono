import 'dart:io';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../data/courses_api_provider.dart';
import '../../domain/course.dart';
import '../widgets/screen_protected.dart';

/// Fullscreen PDF viewer for a lesson attachment. Wrapped in [ScreenProtected]
/// to keep FLAG_SECURE / iOS leakage protection asserted on the activity for
/// the duration of viewing — even though the parent [LessonPage] usually
/// already has it on, re-asserting here is idempotent on Android and protects
/// the path where the viewer is opened directly via a deep link in future.
///
/// The PDF is downloaded once into the app's temp dir (authorised via the
/// Firebase bearer token), then opened from the local path. No "save / share /
/// print" surface is exposed.
class ProtectedPdfViewerPage extends ConsumerStatefulWidget {
  final LessonAttachment attachment;

  const ProtectedPdfViewerPage({super.key, required this.attachment});

  @override
  ConsumerState<ProtectedPdfViewerPage> createState() =>
      _ProtectedPdfViewerPageState();
}

class _ProtectedPdfViewerPageState
    extends ConsumerState<ProtectedPdfViewerPage> {
  late Future<File> _fileFuture;

  @override
  void initState() {
    super.initState();
    _fileFuture = _download();
  }

  Future<File> _download() async {
    final u = fb.FirebaseAuth.instance.currentUser;
    if (u == null) throw StateError('not_authenticated');
    final token = await u.getIdToken();
    if (token == null) throw StateError('no_id_token');
    return ref.read(coursesApiProvider).downloadAttachment(
          urlPath: widget.attachment.urlPath,
          attachmentId: widget.attachment.id,
          idToken: token,
        );
  }

  void _retry() {
    setState(() {
      _fileFuture = _download();
    });
  }

  @override
  Widget build(BuildContext context) {
    return ScreenProtected(
      child: Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: Column(
            children: [
              _NavBar(title: widget.attachment.fileName),
              Expanded(
                child: FutureBuilder<File>(
                  future: _fileFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState != ConnectionState.done) {
                      return const Center(
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.white,
                        ),
                      );
                    }
                    if (snapshot.hasError) {
                      return _ErrorView(
                        message: snapshot.error is NetworkException
                            ? 'Нет соединения с сервером'
                            : 'Не удалось открыть документ',
                        onRetry: _retry,
                      );
                    }
                    final file = snapshot.data!;
                    return PDFView(
                      filePath: file.path,
                      autoSpacing: true,
                      enableSwipe: true,
                      swipeHorizontal: false,
                      pageSnap: false,
                      pageFling: false,
                      fitPolicy: FitPolicy.WIDTH,
                    );
                  },
                ),
              ),
            ],
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
                Icons.close,
                color: AppColors.white,
                size: 22,
              ),
              tooltip: 'Закрыть',
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
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -0.3,
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
