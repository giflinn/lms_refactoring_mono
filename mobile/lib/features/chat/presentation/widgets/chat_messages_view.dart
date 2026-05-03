import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/chat_format.dart';
import '../../domain/chat_models.dart';
import 'message_bubble.dart';

typedef BubbleSideResolver = BubbleSide Function(ChatMessage m);

/// Scrollable list of message bubbles grouped by day. Used by both the client
/// chat screen and the staff conversation screen — they only differ in how
/// `resolveSide` decides which side a sender lands on.
class ChatMessagesView extends StatelessWidget {
  final List<ChatMessage> messages;
  final BubbleSideResolver resolveSide;
  final ScrollController? controller;
  final EdgeInsets padding;

  const ChatMessagesView({
    super.key,
    required this.messages,
    required this.resolveSide,
    this.controller,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
  });

  @override
  Widget build(BuildContext context) {
    if (messages.isEmpty) {
      return const SizedBox.shrink();
    }
    final items = _groupByDay(messages);
    return ScrollConfiguration(
      // Strip Android 12+ stretch overscroll — visually noisy in chat where
      // the user routinely flicks past the top/bottom edge.
      behavior: const _NoOverscrollBehavior(),
      // reverse: true is the standard chat-UI layout — pixel offset 0 is
      // the bottom (newest message), and growing the chronological list with
      // older messages just appends to the visual top without disturbing the
      // user's scroll position. Also dodges the jumpTo(maxScrollExtent)
      // shortfall when items at the bottom (tall images, multi-line text)
      // haven't been measured yet on first paint.
      child: ListView.builder(
        controller: controller,
        padding: padding,
        reverse: true,
        itemCount: items.length,
        itemBuilder: (_, i) => items[items.length - 1 - i],
      ),
    );
  }

  List<Widget> _groupByDay(List<ChatMessage> ms) {
    final out = <Widget>[];
    String? lastKey;
    for (final m in ms) {
      final key = dayKey(m.createdAt);
      if (key != lastKey) {
        out.add(_DaySeparator(label: formatDaySeparator(m.createdAt)));
        lastKey = key;
      }
      out.add(MessageBubble(message: m, side: resolveSide(m)));
    }
    return out;
  }
}

class _NoOverscrollBehavior extends MaterialScrollBehavior {
  const _NoOverscrollBehavior();

  @override
  Widget buildOverscrollIndicator(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) =>
      child;
}

class _DaySeparator extends StatelessWidget {
  final String label;
  const _DaySeparator({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.white.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: AppColors.white.withValues(alpha: 0.85),
            ),
          ),
        ),
      ),
    );
  }
}
