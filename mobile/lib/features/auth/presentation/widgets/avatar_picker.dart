import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/design/tokens.dart';

class AvatarPicker extends StatelessWidget {
  final String? imagePath;
  final ValueChanged<String?> onChanged;

  const AvatarPicker({
    super.key,
    required this.imagePath,
    required this.onChanged,
  });

  Future<void> _pick(BuildContext context) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: AppColors.purpleDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera, color: AppColors.white),
              title: const Text('Камера',
                  style: TextStyle(color: AppColors.white)),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library, color: AppColors.white),
              title: const Text('Галерея',
                  style: TextStyle(color: AppColors.white)),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
            if (imagePath != null)
              ListTile(
                leading: const Icon(Icons.delete_outline,
                    color: AppColors.redError),
                title: const Text('Удалить фото',
                    style: TextStyle(color: AppColors.redError)),
                onTap: () => Navigator.pop(ctx),
              ),
          ],
        ),
      ),
    );
    if (source == null) {
      // User tapped "Удалить фото" → bottom sheet returns null but we want to clear.
      if (imagePath != null) onChanged(null);
      return;
    }
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: source,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
    );
    if (picked != null) onChanged(picked.path);
  }

  @override
  Widget build(BuildContext context) {
    final hasImage = imagePath != null;
    return Column(
      children: [
        GestureDetector(
          onTap: () => _pick(context),
          child: Container(
            width: 88,
            height: 88,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.white.withValues(alpha: 0.1),
              border: Border.all(
                color: AppColors.white.withValues(alpha: 0.3),
              ),
              image: hasImage
                  ? DecorationImage(
                      image: FileImage(File(imagePath!)),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            child: hasImage
                ? null
                : Icon(
                    Icons.add,
                    color: AppColors.white.withValues(alpha: 0.7),
                    size: 32,
                  ),
          ),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => _pick(context),
          child: Text(
            hasImage ? 'Выбрать другое фото' : 'Выбрать фото',
            style: const TextStyle(
              color: AppColors.yellowPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
