# Описание API

Полная спецификация: [openapi.yaml](openapi.yaml) (OpenAPI 3.1, генерируется из кода командой `make openapi`). Интерактивно: Swagger UI на http://localhost:8000/docs, ReDoc на http://localhost:8000/redoc. Коллекция запросов со сквозными сценариями: [postman/BlokTea.postman_collection.json](postman/BlokTea.postman_collection.json).

Базовый адрес: `http://localhost:8000/api/v1` (через фронтенд: `http://localhost:8080/api/v1`).

## Общие правила

| Тема | Правило |
|---|---|
| Авторизация | `POST /auth/login` возвращает `access_token` (JWT, 15 мин) и ставит refresh-токен в HttpOnly cookie на `Path=/api/v1/auth`. Остальные запросы: `Authorization: Bearer <access_token>`. Refresh-токены ротируются, повторное использование старого отзывает все сессии пользователя |
| Права | Клиентские ручки требуют роль в компании (`403 NO_COMPANY_ROLE`) и право на действие (`403 FORBIDDEN_ACTION`). Ручки `/bank/*` доступны только сотрудникам банка, настройки скоринга только `bank_admin`. Чужая заявка: `404` |
| Деньги | `{ "value": 200000000, "currency": "RUB" }`, `value` в копейках |
| Даты | ISO 8601 с часовым поясом |
| Ошибки | `{ "error": { "code": "VALIDATION_ERROR", "message": "Проверьте поля", "details": { "поле": "что не так" } } }` |
| Коды ошибок | `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN_ACTION`, `404 NOT_FOUND`, `409 INVALID_TRANSITION` / `VERSION_CONFLICT`, `410 OFFER_EXPIRED`, `422 VALIDATION_ERROR`, `429 TOO_MANY_REQUESTS`, `503 INTEGRATION_UNAVAILABLE` |
| Идемпотентность | Любой `POST` с заголовком `Idempotency-Key` при повторе возвращает сохранённый ответ (24 ч) с заголовком `Idempotent-Replayed: true` |
| Конкурентное редактирование | `PATCH /applications/{id}` принимает `version`; устаревшая версия даёт `409 VERSION_CONFLICT` |
| Rate limit | Вход и коды подтверждения: 10 попыток в минуту |
| Пагинация | `page`, `page_size` (до 100); ответ `{ items, page, page_size, total }` |
| Действия | Заявка отдаёт `available_actions` (например `offer.accept`, `signing.sign`): интерфейс показывает только разрешённые кнопки |

## Группы ручек

### Авторизация и профиль

| Метод и путь | Назначение |
|---|---|
| `POST /auth/login` | вход по почте и паролю |
| `POST /auth/refresh` | новая пара токенов по cookie |
| `POST /auth/logout` | выход, отзыв refresh-токена |
| `POST /auth/invite/accept` | вход сотрудника по коду приглашения |
| `GET /home` | пользователь, роль, права, компания, счета, онбординг, непрочитанные уведомления |
| `GET /health` | состояние БД, моков внешних систем и LLM, флаг `demo_mode` |

### Компания и команда

| Метод и путь | Назначение |
|---|---|
| `GET /company/profile` | реквизиты из ЕГРЮЛ/ЕГРИП и данные из Альфа-Бизнеса |
| `POST /company/registry/confirm`, `PATCH /company/details`, `POST /onboarding/complete` | онбординг: подтвердить реквизиты, дополнить профиль |
| `GET/PATCH /company/finance-summary` | поступления, расходы, свободный поток за 12 месяцев; клиент может уточнить |
| `GET /company/readiness` | готовность к кредиту: что в порядке и что улучшить |
| `GET /company/members`, `POST /company/members/invite`, `PATCH/DELETE /company/members/{id}`, `POST .../approve` | команда и права |
| `GET/PUT /company/signing-rules` | кто отправляет на подписание и кто подписывает |

### Подбор и продукты

| Метод и путь | Назначение |
|---|---|
| `GET /products`, `GET /products/{code}` | каталог с условиями |
| `POST /calculator/payment` | платёж и переплата |
| `POST /matching-sessions`, `GET/PATCH /matching-sessions/{id}` | шаги подбора: потребность, подтверждение финансов, доп. сведения |
| `POST /matching-sessions/{id}/recommend` | до 3 вариантов с нагрузкой и объяснением |
| `GET /offers/preapproved` | предодобренное предложение (`204`, если нет) |

### Заявка клиента

| Метод и путь | Назначение |
|---|---|
| `GET /applications` | список со счётчиками по группам статусов, фильтр `status`, сортировка `sort` |
| `POST /applications` | создать из рекомендации, каталога или предодобренного предложения |
| `GET/PATCH /applications/{id}` | карточка с таймлайном и решением; автосохранение черновика |
| `GET /applications/{id}/requirements` | чек-лист: согласия, документы, подтверждения |
| `POST /applications/{id}/consents/{type}/challenge` → `.../confirm` | подписать согласие кодом |
| `POST /applications/{id}/submit` | отправить в банк; дальше фоновые автопроверки |
| `POST /applications/{id}/handoff` | передать заявку сотруднику |
| `POST /applications/{id}/cancel` | отозвать |
| `POST /applications/{id}/offer/accept`, `.../offer/decline` | принять или отклонить решение банка |
| `GET /applications/{id}/info-requests/{rid}`, `POST .../respond` | запрос банка и ответ |
| `GET /applications/{id}/signing`, `POST .../signing/challenge` → `.../signing/confirm`, `POST .../signing/remind` | подписание по очереди подписантов |
| `GET /loans`, `GET /loans/{id}` | выданные кредиты и график |

### Документы, задачи, лента

| Метод и путь | Назначение |
|---|---|
| `GET /document-types`, `GET /documents`, `GET /documents/missing` | справочник, документы компании, чего не хватает |
| `POST /documents` (multipart) | загрузка; при `LLM_ENABLED=true` фоновая ИИ-проверка |
| `POST /documents/from-lk` | выписка или справка из Альфа-Бизнеса без загрузки файла |
| `GET /documents/{id}`, `GET .../file`, `POST .../versions`, `POST .../analyze`, `DELETE` | карточка, файл, новая версия, повторная проверка |
| `GET /tasks`, `POST /tasks/{id}/reassign`, `POST /tasks/request-document` | «требуется ваше действие», передача задачи коллеге |
| `GET /feed` | персональная лента: новости с причиной показа и события по заявкам |
| `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all` | уведомления в кабинете |

### Банк

| Метод и путь | Назначение |
|---|---|
| `GET /bank/applications` | очередь с приоритетом |
| `POST /bank/applications/{id}/take` | взять в работу |
| `GET /bank/applications/{id}` | карточка аналитика: проверки, скоринг, нагрузка, документы, звонки |
| `POST /bank/applications/{id}/ai-summary` | ИИ-резюме заявки |
| `POST /bank/applications/{id}/rerun-checks` | повторить автопроверки (например, после сбоя источника) |
| `POST /bank/applications/{id}/calls` | карточка звонка |
| `GET /bank/applications/{id}/counter-offer-options` | варианты контрпредложения |
| `POST /bank/applications/{id}/decision/preview`, `POST .../decision` | решение: `approve`, `counter_offer`, `request_info`, `reject` |
| `GET /bank/info-request-templates`, `GET /bank/rejection-reasons` | справочники для решения |
| `GET /bank/dashboard` | показатели процесса |
| `GET/PUT /bank/settings/scoring` | пороги скоринга и нагрузки (`bank_admin`) |

## Пример: сквозной путь

```text
POST /auth/login                                   клиент
POST /matching-sessions                            → session_id
PATCH /matching-sessions/{sid}                     потребность, финансы, доп. сведения
POST /matching-sessions/{sid}/recommend
POST /applications                                 { source: recommendation, matching_session_id, keep_requested }
POST /applications/{id}/consents/consent_bki/challenge  → challenge_id, demo_code
POST /applications/{id}/consents/consent_bki/confirm
POST /applications/{id}/submit                     → submitted, затем in_review / approved / info_requested / rejected
POST /auth/login                                   аналитик
POST /bank/applications/{id}/take
POST /bank/applications/{id}/decision              { type: counter_offer, amount, term_months, rate_percent, reason_code }
POST /applications/{id}/offer/accept               клиент → signing
POST /applications/{id}/signing/challenge|confirm  каждый подписант → issued
GET  /loans
```

Эта цепочка целиком собрана в папке 13 Postman-коллекции.

## Внешние системы (моки)

Сервис `mocks` на порту 8100, контракты упрощены (кейс, «Пространство решений», п. 5):

| Путь | Система |
|---|---|
| `/alfa/users/{login}`, `/alfa/companies/{inn}/accounts`, `/transactions`, `/loans`, `/payroll`, `/accounting`, `/invoices`, `/preapproved-offers`, `/multibank`, `POST /statements` | Альфа-Бизнес Онлайн |
| `/registry/{inn}` | ЕГРЮЛ / ЕГРИП |
| `/msp/{inn}` | реестр МСП |
| `/bki/{inn}` | бюро кредитных историй |
| `/fns/{inn}` | ФНС «Прозрачный бизнес» |
