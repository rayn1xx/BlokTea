# Архитектура фронтенда

Код разложен по бизнес-доменам. Каждый домен содержит свои вызовы API, хуки, типы контрактов, компоненты и экраны.

```
frontend/src/
  main.tsx                 точка входа: MSW для демо-учёток, QueryClient, роутер
  app/                     сборка приложения
    router.tsx             роуты (раздел 3 спецификации)
    access.ts              доступ по роли: can(home, 'apply' | 'manage_team' | …)
    session.ts             куда вести после входа
    env.ts                 флаги USE_MOCKS, DEMO_MODE
  shared/                  общее, не знает ни о каком домене
    api/                   HTTP-клиент, токен, QueryClient, ключи кеша, /health
    types/common.ts        общие типы контрактов: Money, Sourced, роли, статусы
    ui/                    UI-кит поверх Core DS, вход через @/shared/ui
    lib/                   форматирование денег и дат, автосохранение
    i18n/ru.ts             все тексты интерфейса
  features/<домен>/
    types.ts               типы контрактов домена (раздел «Контракты API»)
    api.ts                 вызовы ручек домена
    hooks.ts               хуки TanStack Query
    components/            компоненты домена
    screens/               экраны (S…, B…)
  mocks/                   MSW: фикстуры, логика конвейера, обработчики
```

## Домены

| Домен | Ручки | Экраны |
|---|---|---|
| `auth` | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/invite/accept` | S1, S2, S4 |
| `profile` | `/home` | каркас кабинета, демо-панель, защита роутов по роли |
| `company` | `/company/profile`, `/company/registry/confirm`, `/company/details`, `/onboarding/complete`, `/company/finance-summary`, `/company/readiness` | S3, готовность |
| `team` | `/company/members/*`, `/company/signing-rules` | S21, S8, S7 (выбор сотрудника) |
| `tasks` | `/tasks`, `/tasks/{id}/reassign` | блок задач на главной |
| `products` | `/products`, `/calculator/payment`, `/offers/preapproved` | S13 |
| `matching` | `/matching-sessions/*` | S9-S12 (по файлу на шаг в `steps/`) |
| `applications` | `/applications/*`: создание, черновик, согласия, отправка, отзыв, решение | S14, S15, S17 |
| `info-requests` | `/applications/{id}/info-requests/*` | S16 |
| `signing` | `/applications/{id}/signing/*` | S18 |
| `loans` | `/loans` | S19 |
| `documents` | `/document-types`, `/documents/*` | S20, загрузка документа |
| `feed`, `notifications` | `/feed`, `/notifications/*` | лента на главной, уведомления |
| `home` | только собирает блоки других доменов | S5, S6 |
| `bank` | `/bank/*` | B1-B4 |

## Правила

1. `shared` не импортирует ничего из `features`. Если общему коду нужен тип, он лежит в `shared/types/common.ts`.
2. Домен может импортировать `types`, `api` и `hooks` другого домена. Например, заявка ссылается на `InfoRequest` и `SigningState`.
3. Компоненты из `shared/ui` подключаются одной строкой: `import { Card, Note } from '@/shared/ui'`.
4. Ключи кеша TanStack Query собраны в `shared/api/queryKeys.ts`: после действия со статусом заявки нужно сбросить кеш сразу нескольких доменов (`invalidateApplication`).
5. Тексты интерфейса только в `shared/i18n/ru.ts`, чтобы аналитики правили их без кода.
6. Пути через алиас `@/`: `@/features/applications/api`, `@/shared/ui`.
