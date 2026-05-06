import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';
import 'package:youtube_player_flutter/youtube_player_flutter.dart';
import '../../../../core/design/tokens.dart';
import '../../data/catalog_api_provider.dart';
import '../../domain/product.dart';

/// Cover-video frame on the product detail page. Mirrors the cover image's
/// 16:11 aspect + 20px corner radius so the two visuals stack harmoniously.
///
/// Source detection lives in [Product.videoSource]:
///   file    → Chewie + video_player (range-streamed from /product-videos/)
///   youtube → youtube_player_flutter (native iframe)
///   null    → widget renders nothing (parent should not have rendered it
///             in the first place; defensive fallback)
///
/// Autoplay starts muted on both backends — Apple/Android browsers refuse
/// audible autoplay, and the user can unmute via the native controls.
class ProductVideo extends ConsumerStatefulWidget {
  final Product product;
  const ProductVideo({super.key, required this.product});

  @override
  ConsumerState<ProductVideo> createState() => _ProductVideoState();
}

class _ProductVideoState extends ConsumerState<ProductVideo> {
  VideoPlayerController? _videoController;
  ChewieController? _chewieController;
  YoutubePlayerController? _ytController;

  @override
  void initState() {
    super.initState();
    _initController();
  }

  @override
  void didUpdateWidget(covariant ProductVideo oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldUrl = oldWidget.product.videoUrl;
    final newUrl = widget.product.videoUrl;
    if (oldUrl != newUrl) {
      _disposeControllers();
      _initController();
    }
  }

  void _initController() {
    final source = widget.product.videoSource;
    final url = widget.product.videoUrl;
    if (source == null || url == null) return;

    if (source == ProductVideoSource.youtube) {
      final id = extractYoutubeId(url);
      if (id == null) return;
      _ytController = YoutubePlayerController(
        initialVideoId: id,
        flags: YoutubePlayerFlags(
          autoPlay: widget.product.videoAutoplay,
          mute: widget.product.videoAutoplay,
          enableCaption: false,
          forceHD: false,
        ),
      );
      return;
    }

    final api = ref.read(catalogApiProvider);
    final resolved = api.resolveVideoUrl(url);
    if (resolved == null) return;
    final controller = VideoPlayerController.networkUrl(Uri.parse(resolved));
    _videoController = controller;
    controller
        .initialize()
        .then((_) {
          if (!mounted) return;
          setState(() {
            _chewieController = ChewieController(
              videoPlayerController: controller,
              autoPlay: widget.product.videoAutoplay,
              looping: false,
              showControlsOnInitialize: !widget.product.videoAutoplay,
              materialProgressColors: ChewieProgressColors(
                playedColor: AppColors.purplePrimary,
                handleColor: AppColors.purplePrimary,
                backgroundColor: Colors.white24,
                bufferedColor: Colors.white38,
              ),
            );
            if (widget.product.videoAutoplay) {
              controller.setVolume(0);
            }
          });
        })
        .catchError((_) {
          // initialise can fail on unsupported codecs / network blips. Falls
          // through to the placeholder below; controllers stay null.
          if (!mounted) return;
          setState(() {});
        });
  }

  void _disposeControllers() {
    _chewieController?.dispose();
    _chewieController = null;
    _videoController?.dispose();
    _videoController = null;
    _ytController?.dispose();
    _ytController = null;
  }

  @override
  void dispose() {
    _disposeControllers();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final source = widget.product.videoSource;
    Widget content;
    if (source == ProductVideoSource.youtube && _ytController != null) {
      // Wrap the YouTube player so we can apply the cover-style border
      // radius. The package's progressIndicatorColor matches the cover
      // gradient family.
      content = YoutubePlayer(
        controller: _ytController!,
        showVideoProgressIndicator: true,
        progressIndicatorColor: AppColors.purplePrimary,
        progressColors: const ProgressBarColors(
          playedColor: AppColors.purplePrimary,
          handleColor: AppColors.purplePrimary,
        ),
      );
    } else if (source == ProductVideoSource.file && _chewieController != null) {
      content = Chewie(controller: _chewieController!);
    } else {
      content = Container(
        color: AppColors.purpleGradientBottom,
        alignment: Alignment.center,
        child: const SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation(AppColors.white),
          ),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: AspectRatio(aspectRatio: 16 / 11, child: content),
    );
  }
}
