# Роуты фронтенда

| Роут | Экран | Файл (в `frontend/src/`) |
|---|---|---|
| `/` | S1 Старт | `features/auth/screens/StartScreen.tsx` |
| `/login` | S2 Вход | `features/auth/screens/LoginScreen.tsx` |
| `/join` | S4 По приглашению | `features/auth/screens/JoinScreen.tsx` |
| `/onboarding/company` | S3 Данные компании | `features/company/screens/OnboardingScreen.tsx` |
| `/home` | S5 / S6 Главная | `features/home/screens/HomeScreen.tsx` |
| `/team`, `/team/invite` | S21 Команда, S8 Пригласить | `features/team/screens/TeamScreen.tsx`, `InviteScreen.tsx` |
| `/match/:sessionId/step/1..4` | S9-S12 Подбор | `features/matching/screens/MatchingScreen.tsx`, шаги в `steps/` |
| `/readiness` | Готовность к кредиту | `features/company/screens/ReadinessScreen.tsx` |
| `/products`, `/products/:code` | S13 Каталог | `features/products/screens/ProductsScreen.tsx`, `ProductScreen.tsx` |
| `/applications/:id/edit` | S14 Заявка | `features/applications/screens/ApplicationEditScreen.tsx` |
| `/applications/:id` | S15 Карточка, S17 Решение | `features/applications/screens/ApplicationScreen.tsx` |
| `/applications/:id/info-requests/:rid` | S16 Запрос банка | `features/info-requests/screens/InfoRequestScreen.tsx` |
| `/applications/:id/signing` | S18 Подписание | `features/signing/screens/SigningScreen.tsx` |
| `/loans/:id` | S19 Выдача и график | `features/loans/screens/LoanScreen.tsx` |
| `/documents` | S20 Документы | `features/documents/screens/DocumentsScreen.tsx` |
| `/notifications` | Уведомления | `features/notifications/screens/NotificationsScreen.tsx` |
| `/bank/queue` | B1 Очередь | `features/bank/screens/BankQueueScreen.tsx` |
| `/bank/applications/:id` | B2 Карточка аналитика | `features/bank/screens/BankApplicationScreen.tsx` |
| `/bank/applications/:id/decision` | B3 Решение | `features/bank/screens/BankDecisionScreen.tsx` |
| `/bank/dashboard`, `/bank/settings` | B4 Показатели и настройки | `features/bank/screens/BankDashboardScreen.tsx`, `BankSettingsScreen.tsx` |

S7 «Передать задачу» открывается модальным окном (`features/team/components/MemberPicker.tsx`) с главной, из S14 и S16.
