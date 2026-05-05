import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../controller/clients_list_controller.dart';
import '../widgets/client_tile.dart';

/// Staff bottom-nav tab "Клиенты". Composed inside `StaffShellPage` (no own
/// app bar — the shell owns the topbar with avatar + brand). Provides the
/// search field and the lazy-loaded list; tapping a row pushes
/// `/staff/clients/:id` for the detail screen.
class ClientsListPage extends ConsumerStatefulWidget {
  const ClientsListPage({super.key});

  @override
  ConsumerState<ClientsListPage> createState() => _ClientsListPageState();
}

class _ClientsListPageState extends ConsumerState<ClientsListPage> {
  final _scroll = ScrollController();
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onScroll() {
    // Trigger the next page when we're within 400px of the bottom — gives
    // the request time to land before the user hits the actual end.
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 400) {
      ref.read(clientsListProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(clientsListProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: _SearchField(
            controller: _searchCtrl,
            onChanged: (v) =>
                ref.read(clientsListProvider.notifier).setQuery(v),
            onClear: () {
              _searchCtrl.clear();
              ref.read(clientsListProvider.notifier).setQuery('');
            },
          ),
        ),
        Expanded(
          child: _ListView(
            state: state,
            scroll: _scroll,
            onRefresh: () =>
                ref.read(clientsListProvider.notifier).refresh(),
            onTapClient: (id) => context.push('/staff/clients/$id'),
          ),
        ),
      ],
    );
  }
}

class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  const _SearchField({
    required this.controller,
    required this.onChanged,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      style: const TextStyle(color: AppColors.white, fontSize: 15),
      cursorColor: AppColors.white,
      decoration: InputDecoration(
        hintText: 'Поиск по имени, email, телефону',
        hintStyle: TextStyle(color: AppColors.white.withValues(alpha: 0.5)),
        filled: true,
        fillColor: AppColors.white.withValues(alpha: 0.1),
        prefixIcon: Icon(
          Icons.search,
          color: AppColors.white.withValues(alpha: 0.6),
          size: 20,
        ),
        suffixIcon: controller.text.isEmpty
            ? null
            : IconButton(
                icon: Icon(
                  Icons.close,
                  color: AppColors.white.withValues(alpha: 0.6),
                  size: 18,
                ),
                onPressed: onClear,
              ),
        contentPadding: const EdgeInsets.symmetric(vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}

class _ListView extends StatelessWidget {
  final ClientsListState state;
  final ScrollController scroll;
  final Future<void> Function() onRefresh;
  final void Function(String clientId) onTapClient;

  const _ListView({
    required this.state,
    required this.scroll,
    required this.onRefresh,
    required this.onTapClient,
  });

  @override
  Widget build(BuildContext context) {
    if (state.loadingFirst && state.clients.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.white),
      );
    }
    if (state.error != null && state.clients.isEmpty) {
      return _ErrorView(onRetry: onRefresh);
    }
    if (state.clients.isEmpty) {
      return _EmptyView(query: state.query);
    }

    return RefreshIndicator(
      color: AppColors.purplePrimary,
      onRefresh: onRefresh,
      child: ListView.builder(
        controller: scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: state.clients.length + (state.loadingMore ? 1 : 0),
        itemBuilder: (_, i) {
          if (i >= state.clients.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.white),
              ),
            );
          }
          final c = state.clients[i];
          return ClientTile(client: c, onTap: () => onTapClient(c.id));
        },
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  final String query;
  const _EmptyView({required this.query});

  @override
  Widget build(BuildContext context) {
    final isSearching = query.trim().isNotEmpty;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          isSearching
              ? 'По запросу «$query» ничего не найдено'
              : 'Клиентов пока нет',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.white.withValues(alpha: 0.6),
            fontSize: 15,
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final Future<void> Function() onRetry;
  const _ErrorView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Не удалось загрузить клиентов',
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.8),
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
    );
  }
}
