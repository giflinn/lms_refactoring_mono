import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart' show NetworkException;
import '../../../../core/widgets/gradient_background.dart';
import '../../data/legal_api.dart';
import '../../data/legal_api_provider.dart';
import '../widgets/legal_html.dart';

/// Generic viewer for one of the four legal documents (about / privacy /
/// terms / offer). Opened from Settings ("Про нас", "Конфиденциальность"),
/// from Cart, and from the product detail terms checkbox. Fetches once on
/// mount via the public /legal/:slug endpoint.
class LegalDocumentPage extends ConsumerStatefulWidget {
  final String slug;

  const LegalDocumentPage({super.key, required this.slug});

  @override
  ConsumerState<LegalDocumentPage> createState() => _LegalDocumentPageState();
}

class _LegalDocumentPageState extends ConsumerState<LegalDocumentPage> {
  late Future<LegalDocument> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(legalApiProvider).get(widget.slug);
  }

  void _retry() {
    setState(() {
      _future = ref.read(legalApiProvider).get(widget.slug);
    });
  }

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: FutureBuilder<LegalDocument>(
            future: _future,
            builder: (context, snapshot) {
              final title = snapshot.data?.title ?? _fallbackTitle(widget.slug);
              return Column(
                children: [
                  _NavBar(title: title),
                  Expanded(
                    child: _buildBody(snapshot),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildBody(AsyncSnapshot<LegalDocument> snapshot) {
    if (snapshot.connectionState != ConnectionState.done) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.white),
      );
    }
    if (snapshot.hasError) {
      final isNetwork = snapshot.error is NetworkException;
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                isNetwork
                    ? 'Нет соединения с сервером'
                    : 'Не удалось загрузить документ',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: _retry,
                child: const Text(
                  'Повторить',
                  style: TextStyle(color: AppColors.yellowPrimary),
                ),
              ),
            ],
          ),
        ),
      );
    }
    final doc = snapshot.data;
    if (doc == null || doc.contentHtml.trim().isEmpty) {
      return const Center(
        child: Text(
          'Документ пока пуст',
          style: TextStyle(color: AppColors.white, fontSize: 15),
        ),
      );
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: LegalHtml(html: doc.contentHtml),
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
                Icons.arrow_back_ios,
                color: AppColors.white,
                size: 20,
              ),
              tooltip: 'Назад',
            ),
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 56),
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -0.4,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _fallbackTitle(String slug) {
  switch (slug) {
    case 'about':
      return 'О нас';
    case 'privacy':
      return 'Политика конфиденциальности';
    case 'terms':
      return 'Условия использования';
    case 'offer':
      return 'Публичная оферта';
    default:
      return 'Документ';
  }
}
