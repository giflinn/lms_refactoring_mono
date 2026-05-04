import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/chat_format.dart';

typedef SendCallback = Future<void> Function(String body, List<File> files);

class MessageInput extends StatefulWidget {
  final SendCallback onSend;
  final bool enabled;

  const MessageInput({super.key, required this.onSend, this.enabled = true});

  @override
  State<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput> {
  final _controller = TextEditingController();
  final _files = <File>[];
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pickAttachment() async {
    final res = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.purpleDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(
                  Icons.image_outlined,
                  color: AppColors.white,
                ),
                title: const Text(
                  'Картинка из галереи',
                  style: TextStyle(color: AppColors.white),
                ),
                onTap: () => Navigator.of(ctx).pop('image'),
              ),
              ListTile(
                leading: const Icon(
                  Icons.camera_alt_outlined,
                  color: AppColors.white,
                ),
                title: const Text(
                  'Сфотографировать',
                  style: TextStyle(color: AppColors.white),
                ),
                onTap: () => Navigator.of(ctx).pop('camera'),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
    if (res == null || !mounted) return;
    if (res == 'image') {
      final picker = ImagePicker();
      final picked = await picker.pickMultiImage();
      if (picked.isEmpty) return;
      setState(() {
        for (final x in picked) {
          if (_files.length >= 5) break;
          _files.add(File(x.path));
        }
      });
    } else if (res == 'camera') {
      final picker = ImagePicker();
      final picked = await picker.pickImage(source: ImageSource.camera);
      if (picked == null) return;
      setState(() {
        if (_files.length < 5) _files.add(File(picked.path));
      });
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty && _files.isEmpty) return;
    setState(() => _sending = true);
    try {
      await widget.onSend(text, List.of(_files));
      if (!mounted) return;
      _controller.clear();
      setState(() => _files.clear());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_files.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (var i = 0; i < _files.length; i++)
                    _AttachmentChip(
                      file: _files[i],
                      onRemove: () => setState(() => _files.removeAt(i)),
                    ),
                ],
              ),
            ),
          Container(
            decoration: BoxDecoration(
              color: AppColors.white.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(28),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Row(
              children: [
                IconButton(
                  onPressed: widget.enabled && !_sending
                      ? _pickAttachment
                      : null,
                  icon: const Icon(
                    Icons.attach_file,
                    color: AppColors.white,
                    size: 20,
                  ),
                ),
                Expanded(
                  child: TextField(
                    controller: _controller,
                    enabled: widget.enabled && !_sending,
                    style: const TextStyle(color: AppColors.white),
                    cursorColor: AppColors.white,
                    minLines: 1,
                    maxLines: 5,
                    decoration: InputDecoration(
                      hintText: 'Сообщение',
                      hintStyle: TextStyle(
                        color: AppColors.white.withValues(alpha: 0.5),
                      ),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 8,
                      ),
                    ),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                IconButton(
                  onPressed: widget.enabled && !_sending ? _send : null,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  iconSize: 36,
                  icon: _sending
                      ? const SizedBox(
                          width: 36,
                          height: 36,
                          child: Padding(
                            padding: EdgeInsets.all(9),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.white,
                            ),
                          ),
                        )
                      : SvgPicture.asset(
                          'assets/icons/chat/send.svg',
                          width: 36,
                          height: 36,
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AttachmentChip extends StatelessWidget {
  final File file;
  final VoidCallback onRemove;

  const _AttachmentChip({required this.file, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final name = file.path.split('/').last;
    final size = file.lengthSync();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 140),
            child: Text(
              name,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppColors.white, fontSize: 12),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            formatFileSize(size),
            style: TextStyle(
              fontSize: 10,
              color: AppColors.white.withValues(alpha: 0.7),
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onRemove,
            child: const Icon(Icons.close, size: 14, color: AppColors.white),
          ),
        ],
      ),
    );
  }
}
