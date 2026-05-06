import '../../../core/domain/server_time.dart';

/// Cover rendering mode mirrored from the backend enum. Determines how the
/// product card is composed:
/// - [preset]      → no image; built-in purple gradient + overlay (chip, title,
///                   subtitle, button) drawn on top.
/// - [customBg]    → network image as background + the same overlay.
/// - [customFull]  → just the network image, no overlay.
enum ProductCoverKind { preset, customBg, customFull }

ProductCoverKind _coverKindFromString(String s) {
  switch (s) {
    case 'preset':
      return ProductCoverKind.preset;
    case 'custom_bg':
      return ProductCoverKind.customBg;
    case 'custom_full':
      return ProductCoverKind.customFull;
    default:
      return ProductCoverKind.preset;
  }
}

/// Where the optional cover-video lives on the detail page. `replace` swaps
/// it in for the cover image; `below` shows it under the cover as a separate
/// frame. Mirrored from the backend product_video_display enum.
enum ProductVideoDisplay { replace, below }

ProductVideoDisplay _videoDisplayFromString(String? s) {
  switch (s) {
    case 'below':
      return ProductVideoDisplay.below;
    case 'replace':
    default:
      return ProductVideoDisplay.replace;
  }
}

/// Detected source for [Product.videoUrl]. Uploaded files come back with the
/// path prefix `/product-videos/`; anything else is treated as YouTube and
/// must match the YouTube ID regex below for the player to load it.
enum ProductVideoSource { file, youtube }

final RegExp _youtubeIdRe = RegExp(
  r'^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})',
  caseSensitive: false,
);

String? extractYoutubeId(String url) {
  final m = _youtubeIdRe.firstMatch(url.trim());
  return m?.group(1);
}

class ProductCategorySummary {
  final String id;
  final String name;
  const ProductCategorySummary({required this.id, required this.name});

  factory ProductCategorySummary.fromJson(Map<String, dynamic> json) {
    return ProductCategorySummary(
      id: json['id'] as String,
      name: json['name'] as String,
    );
  }
}

/// Mirror of the backend Telegram group summary attached to a Product when
/// the product grants access to a chat. `chatType` lets the UI swap copy
/// ("канал" vs "группа") without an extra fetch.
enum TelegramChatType { channel, supergroup }

TelegramChatType _chatTypeFromString(String s) =>
    s == 'channel' ? TelegramChatType.channel : TelegramChatType.supergroup;

class ProductTelegramGroup {
  final String id;
  final String title;
  final TelegramChatType chatType;
  final String? description;

  const ProductTelegramGroup({
    required this.id,
    required this.title,
    required this.chatType,
    required this.description,
  });

  String get kindLabel =>
      chatType == TelegramChatType.channel ? 'Telegram-канал' : 'Telegram-группа';

  factory ProductTelegramGroup.fromJson(Map<String, dynamic> json) {
    return ProductTelegramGroup(
      id: json['id'] as String,
      title: json['title'] as String,
      chatType: _chatTypeFromString(json['chatType'] as String),
      description: json['description'] as String?,
    );
  }
}

/// Catalog item exposed to clients. Mirror of the admin Product type minus the
/// admin-only fields (isActive — server already filters; createdAt/updatedAt
/// — not used in the UI).
class Product {
  final String id;
  final String categoryId;
  final ProductCategorySummary? category;
  final String title;
  final String? subtitle;
  final String description;
  final String buttonText;
  final String? price; // null = "по запросу"
  final int daysUntilCancel;
  // null = ordinary product (digital good / non-bookable). Non-null = the
  // product consumes a coach slot of this length when purchased.
  final int? durationMinutes;
  // Slot types this product can be booked against. Empty when not bookable.
  final List<String> slotTypeIds;
  // Telegram-grant fields. Mutually exclusive with bookable
  // (durationMinutes/slotTypeIds). Both null = ordinary product. Both
  // non-null = buying this product grants access to the linked chat.
  final String? telegramGroupId;
  final ProductTelegramGroup? telegramGroup;
  final bool isPromo;
  final bool isTopSearch;
  final ProductCoverKind coverKind;
  // Path under `/product-images/<uuid>.<ext>` — relative to API base. Widgets
  // resolve to a full URL via [ApiClient.baseUrl].
  final String? coverImageUrl;
  // Optional cover-video. When non-null and the path starts with
  // `/product-videos/` it's a self-hosted file (Chewie); otherwise it's a
  // YouTube URL parsed via [extractYoutubeId]. URLs that match neither shape
  // are ignored on the client.
  final String? videoUrl;
  final ProductVideoDisplay videoDisplay;
  final bool videoAutoplay;

  const Product({
    required this.id,
    required this.categoryId,
    required this.category,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.buttonText,
    required this.price,
    required this.daysUntilCancel,
    required this.durationMinutes,
    required this.slotTypeIds,
    required this.telegramGroupId,
    required this.telegramGroup,
    required this.isPromo,
    required this.isTopSearch,
    required this.coverKind,
    required this.coverImageUrl,
    required this.videoUrl,
    required this.videoDisplay,
    required this.videoAutoplay,
  });

  bool get isBookable => durationMinutes != null && slotTypeIds.isNotEmpty;
  bool get isTelegramAccess => telegramGroupId != null;
  bool get hasVideo => videoUrl != null && videoUrl!.isNotEmpty;
  ProductVideoSource? get videoSource {
    final url = videoUrl;
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('/product-videos/')) return ProductVideoSource.file;
    if (extractYoutubeId(url) != null) return ProductVideoSource.youtube;
    return null;
  }

  factory Product.fromJson(Map<String, dynamic> json) {
    final cat = json['category'] as Map<String, dynamic>?;
    final dur = json['durationMinutes'];
    final tg = json['telegramGroup'] as Map<String, dynamic>?;
    return Product(
      id: json['id'] as String,
      categoryId: json['categoryId'] as String,
      category: cat == null ? null : ProductCategorySummary.fromJson(cat),
      title: json['title'] as String,
      subtitle: json['subtitle'] as String?,
      description: json['description'] as String,
      buttonText: json['buttonText'] as String,
      price: json['price'] as String?,
      daysUntilCancel: (json['daysUntilCancel'] as num).toInt(),
      durationMinutes: dur == null ? null : (dur as num).toInt(),
      slotTypeIds:
          (json['slotTypeIds'] as List?)?.cast<String>() ?? const <String>[],
      telegramGroupId: json['telegramGroupId'] as String?,
      telegramGroup: tg == null ? null : ProductTelegramGroup.fromJson(tg),
      isPromo: json['isPromo'] as bool? ?? false,
      isTopSearch: json['isTopSearch'] as bool? ?? false,
      coverKind: _coverKindFromString(json['coverKind'] as String),
      coverImageUrl: json['coverImageUrl'] as String?,
      videoUrl: json['videoUrl'] as String?,
      videoDisplay: _videoDisplayFromString(json['videoDisplay'] as String?),
      videoAutoplay: json['videoAutoplay'] as bool? ?? false,
    );
  }
}

/// One bookable start window inside a coach slot, already sliced to match the
/// product's durationMinutes by the server. The mobile UI groups these by day
/// and renders them as time pills.
class AvailableStart {
  final DateTime startsAt;
  final DateTime endsAt;

  const AvailableStart({required this.startsAt, required this.endsAt});

  factory AvailableStart.fromJson(Map<String, dynamic> json) {
    return AvailableStart(
      startsAt: parseServerTime(json['startsAt'] as String),
      endsAt: parseServerTime(json['endsAt'] as String),
    );
  }
}
