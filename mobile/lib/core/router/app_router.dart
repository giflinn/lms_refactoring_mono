import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/domain/registration_data.dart';
import '../../features/auth/presentation/controller/auth_controller.dart';
import '../../features/auth/presentation/pages/complete_profile_page.dart';
import '../../features/auth/presentation/pages/email_verification_page.dart';
import '../../features/auth/presentation/pages/forgot_password_code_page.dart';
import '../../features/auth/presentation/pages/forgot_password_email_page.dart';
import '../../features/auth/presentation/pages/forgot_password_new_pwd_page.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/register_page.dart';
import '../../features/auth/presentation/pages/restore_account_page.dart';
import '../../features/auth/presentation/pages/splash_page.dart';
import '../../features/catalog/domain/product.dart';
import '../../features/catalog/presentation/pages/product_detail_page.dart';
import '../../features/cabinet/presentation/pages/personal_data_page.dart';
import '../../features/cabinet/presentation/pages/settings_page.dart';
import '../../features/feedback/presentation/pages/feedback_page.dart';
import '../../features/legal/presentation/pages/legal_document_page.dart';
import '../../features/courses/presentation/pages/course_detail_page.dart';
import '../../features/courses/presentation/pages/lesson_page.dart';
import '../../features/clients/presentation/pages/client_detail_page.dart';
import '../../features/clients/presentation/pages/client_purchases_page.dart';
import '../../features/catalog/presentation/pages/search_page.dart';
import '../../features/chat/presentation/pages/client_chat_page.dart';
import '../../features/chat/presentation/pages/staff_conversation_page.dart';
import '../../features/home/presentation/pages/client_shell_page.dart';
import '../../features/home/presentation/pages/staff_shell_page.dart';
import '../../features/notifications/presentation/pages/client_notifications_page.dart';
import '../../features/cancellations/presentation/pages/staff_cancellation_detail_page.dart';
import '../../features/orders/presentation/pages/client_order_detail_page.dart';
import '../../features/orders/presentation/pages/my_purchases_page.dart';
import '../../features/orders/presentation/pages/staff_order_detail_page.dart';
import '../../features/reviews/domain/leave_review_args.dart';
import '../../features/reviews/presentation/pages/all_reviews_page.dart';
import '../../features/reviews/presentation/pages/leave_review_page.dart';
import '../../features/reviews/presentation/pages/my_reviews_page.dart';
import '../../features/reviews/presentation/pages/staff_client_reviews_page.dart';
import '../domain/app_user.dart';
import '../domain/role.dart';

/// Routes that the user can be on while signed-out. The redirect uses this
/// to decide whether to bounce them to /login.
const _authRoutes = {
  '/login',
  '/register',
  '/email-verification',
  '/forgot-password',
  '/forgot-password/code',
  '/forgot-password/new',
};

/// Single source of truth for navigation. Reads [authProvider] and redirects
/// based on the auth state:
///   loading       → /splash
///   logged-out    → keep /login or any /forgot-password screen, else /login
///   logged-in     → / or /home, never an auth route
///
/// `complete-profile` is a special case: the Firebase user exists but has no
/// DB row yet, so authProvider is still "logged out" (user==null). We allow
/// it from /login and don't bounce it.
final routerProvider = Provider<GoRouter>((ref) {
  // Bridge Riverpod → Listenable so go_router re-evaluates `redirect` when
  // auth changes. We can't pass `ref.watch(...)` directly because GoRouter
  // expects a Listenable, not an AsyncValue.
  final notifier = ValueNotifier<AsyncValue<AppUser?>>(ref.read(authProvider));
  ref.listen<AsyncValue<AppUser?>>(authProvider, (_, next) {
    notifier.value = next;
  });
  ref.onDispose(notifier.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: notifier,
    debugLogDiagnostics: kDebugMode,
    redirect: (context, state) {
      final auth = notifier.value;
      final loc = state.matchedLocation;

      return auth.when(
        loading: () => loc == '/splash' ? null : '/splash',
        // Bootstrap `fetchMe` failed (no network on cold start). Keep the user
        // on /splash so they see the retry UI. Don't bounce them off auth
        // routes — sign-in pages handle their own per-call errors locally.
        error: (_, _) {
          if (loc == '/splash' ||
              loc == '/complete-profile' ||
              _authRoutes.contains(loc)) {
            return null;
          }
          return '/splash';
        },
        data: (user) {
          // Allow /complete-profile through regardless — it's the bridge from
          // Google sign-in to a fully-synced user.
          if (loc == '/complete-profile') return null;

          if (user == null) {
            // Signed out: only auth routes are allowed.
            // Exception: /legal/* must work pre-signin so the registration
            // form's terms checkbox links can open the policies in-app.
            if (_authRoutes.contains(loc) || loc.startsWith('/legal/')) {
              return null;
            }
            return '/login';
          }
          // Self-deleted clients are pinned to the restore prompt until they
          // either tap "Восстановить" (clears selfDeletedAt → re-evaluates
          // to /home) or "Выйти" (signs out → re-evaluates to /login).
          if (user.selfDeletedAt != null) {
            return loc == '/restore-account' ? null : '/restore-account';
          }
          // Signed in: never linger on splash, auth screens, or the restore
          // prompt page.
          if (loc == '/splash' ||
              loc == '/restore-account' ||
              _authRoutes.contains(loc)) {
            return '/home';
          }
          return null;
        },
      );
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (_, _) => const SplashPage(),
      ),
      GoRoute(
        path: '/login',
        builder: (_, _) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
        builder: (_, _) => const RegisterPage(),
      ),
      GoRoute(
        path: '/email-verification',
        builder: (_, state) =>
            EmailVerificationPage(email: state.extra as String),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (_, _) => const ForgotPasswordEmailPage(),
        routes: [
          GoRoute(
            path: 'code',
            builder: (_, state) =>
                ForgotPasswordCodePage(email: state.extra as String),
          ),
          GoRoute(
            path: 'new',
            builder: (_, state) =>
                ForgotPasswordNewPwdPage(resetToken: state.extra as String),
          ),
        ],
      ),
      GoRoute(
        path: '/complete-profile',
        builder: (_, state) => CompleteProfilePage(
          profile: state.extra as PendingGoogleProfile,
        ),
      ),
      GoRoute(
        path: '/restore-account',
        builder: (_, _) => const RestoreAccountPage(),
      ),
      GoRoute(
        path: '/home',
        builder: (_, _) {
          // Safe to read here: redirect guarantees we only reach this route
          // when authProvider has a non-null AppUser.
          return Consumer(
            builder: (context, ref, _) {
              final role = ref.watch(authProvider).requireValue!.role;
              return role == Role.client
                  ? const ClientShellPage()
                  : const StaffShellPage();
            },
          );
        },
      ),
      GoRoute(
        path: '/client/search',
        builder: (_, _) => const CatalogSearchPage(),
      ),
      GoRoute(
        path: '/client/products/:id',
        builder: (_, state) =>
            ProductDetailPage(product: state.extra as Product),
        routes: [
          GoRoute(
            path: 'reviews',
            builder: (_, state) =>
                AllReviewsPage(productId: state.pathParameters['id']!),
          ),
        ],
      ),
      GoRoute(
        path: '/client/chat',
        builder: (_, state) {
          // /client/chat accepts an optional ChatPrefill via state.extra so
          // the "Мои покупки" → chat handoff can seed the input. Anything
          // else (or null) → no draft.
          final extra = state.extra;
          final draft = extra is ChatPrefill ? extra.text : null;
          return ClientChatPage(initialDraft: draft);
        },
      ),
      GoRoute(
        path: '/client/personal-data',
        builder: (_, _) => const PersonalDataPage(),
      ),
      GoRoute(
        path: '/client/settings',
        builder: (_, _) => const SettingsPage(),
      ),
      GoRoute(
        path: '/client/feedback',
        builder: (_, _) => const FeedbackPage(),
      ),
      GoRoute(
        path: '/legal/:slug',
        builder: (_, state) => LegalDocumentPage(
          slug: state.pathParameters['slug']!,
        ),
      ),
      GoRoute(
        path: '/client/notifications',
        builder: (_, _) => const ClientNotificationsPage(),
      ),
      GoRoute(
        path: '/client/purchases',
        builder: (_, _) => const MyPurchasesPage(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (_, state) => ClientOrderDetailPage(
              orderId: state.pathParameters['id']!,
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/client/courses/:id',
        builder: (_, state) => CourseDetailPage(
          courseId: state.pathParameters['id']!,
        ),
        routes: [
          GoRoute(
            path: 'lessons/:lessonId',
            builder: (_, state) => LessonPage(
              courseId: state.pathParameters['id']!,
              lessonId: state.pathParameters['lessonId']!,
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/client/reviews',
        builder: (_, _) => const MyReviewsPage(),
      ),
      GoRoute(
        path: '/client/reviews/leave',
        builder: (_, state) =>
            LeaveReviewPage(args: state.extra as LeaveReviewArgs),
      ),
      GoRoute(
        path: '/staff/chat/:id',
        builder: (_, state) =>
            StaffConversationPage(threadId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/staff/clients/:id',
        builder: (_, state) =>
            ClientDetailPage(clientId: state.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'purchases',
            builder: (_, state) =>
                ClientPurchasesPage(clientId: state.pathParameters['id']!),
          ),
          GoRoute(
            path: 'reviews',
            builder: (_, state) => StaffClientReviewsPage(
              clientId: state.pathParameters['id']!,
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/staff/orders/:id',
        builder: (_, state) =>
            StaffOrderDetailPage(orderId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/staff/cancellations/:id',
        builder: (_, state) => StaffCancellationDetailPage(
          cancellationId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/staff/profile',
        builder: (_, _) => const PersonalDataPage(
          showVipBadge: false,
          showSignOut: true,
        ),
      ),
    ],
  );
});
