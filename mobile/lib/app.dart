import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth/auth_controller.dart';
import 'pages/home_stub_page.dart';
import 'pages/login_page.dart';
import 'pages/splash_page.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    return MaterialApp(
      title: 'Slyamova Zhanna',
      debugShowCheckedModeBanner: false,
      home: authState.when(
        loading: () => const SplashPage(),
        error: (_, _) => const LoginPage(),
        data: (user) =>
            user == null ? const LoginPage() : HomeStubPage(user: user),
      ),
    );
  }
}
