import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../../../../core/design/tokens.dart';

/// Inline video player used inside the lesson HTML renderer. Handles its own
/// VideoPlayerController + ChewieController lifecycle: build, error, loading,
/// dispose. Wrapped in an aspect-ratio box so the video doesn't jump after
/// metadata loads.
class LessonVideo extends StatefulWidget {
  final String src;

  const LessonVideo({super.key, required this.src});

  @override
  State<LessonVideo> createState() => _LessonVideoState();
}

class _LessonVideoState extends State<LessonVideo> {
  VideoPlayerController? _video;
  ChewieController? _chewie;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      final v = VideoPlayerController.networkUrl(Uri.parse(widget.src));
      await v.initialize();
      if (!mounted) {
        await v.dispose();
        return;
      }
      _chewie = ChewieController(
        videoPlayerController: v,
        autoPlay: false,
        looping: false,
        aspectRatio: v.value.aspectRatio == 0 ? 16 / 9 : v.value.aspectRatio,
        materialProgressColors: ChewieProgressColors(
          playedColor: AppColors.purplePrimary,
          handleColor: AppColors.purplePrimary,
          backgroundColor: Colors.black26,
          bufferedColor: Colors.white24,
        ),
      );
      setState(() => _video = v);
    } catch (err) {
      if (!mounted) return;
      setState(() => _error = err);
    }
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _video?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return AspectRatio(
        aspectRatio: 16 / 9,
        child: Container(
          color: Colors.black12,
          alignment: Alignment.center,
          child: const Text(
            'Не удалось загрузить видео',
            style: TextStyle(color: AppColors.greyDark, fontSize: 13),
          ),
        ),
      );
    }
    final v = _video;
    final c = _chewie;
    if (v == null || c == null) {
      return AspectRatio(
        aspectRatio: 16 / 9,
        child: Container(
          color: Colors.black12,
          alignment: Alignment.center,
          child: const SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.purplePrimary,
            ),
          ),
        ),
      );
    }
    return AspectRatio(
      aspectRatio: v.value.aspectRatio == 0 ? 16 / 9 : v.value.aspectRatio,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Chewie(controller: c),
      ),
    );
  }
}
