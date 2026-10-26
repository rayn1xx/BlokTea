# Модель данных

PostgreSQL 16, схема создаётся миграциями Alembic (`backend/migrations/versions`). ORM-модели: `backend/app/models`. Деньги хранятся в копейках (`BIGINT`), в API передаются как `{ "value": <копейки>, "currency": "RUB" }`.

```mermaid
erDiagram
    users ||--o{ members : "состоит в компаниях"
    companies ||--o{ members : "сотрудники и роли"
    companies ||--|| company_profiles : "профиль и онбординг"
    companies ||--o| signing_rules : "правила подписи"
    companies ||--o{ finance_overrides : "уточнения финансов"
    companies ||--o{ accounts : "счета"
    users ||--o{ accounts : "личные счета"

    companies ||--o{ matching_sessions : "подбор продукта"
    matching_sessions |o--o{ applications : "заявка из подбора"
    credit_products ||--o{ applications : "продукт"
    companies ||--o{ applications : "заявки"

    applications ||--o{ application_events : "история статусов"
    applications ||--o{ consents : "согласия (БКИ и др.)"
    applications ||--o{ check_results : "автопроверки"
    applications ||--o{ scoring_results : "скоринг"
    applications ||--o{ decisions : "решения"
    applications ||--o{ info_requests : "запросы банка"
    applications ||--o{ call_notes : "звонки аналитика"
    applications ||--o| signing_sessions : "подписание"
    applications ||--o{ challenges : "коды подтверждения"
    applications ||--o| loans : "выданный кредит"

    companies ||--o{ documents : "документы"
    applications |o--o{ documents : "приложены к заявке"
    info_requests |o--o{ documents : "ответ на запрос"

    companies ||--o{ tasks : "задачи «требуется действие»"
    users ||--o{ notifications : "уведомления"

    users {
        uuid id PK
        string login UK
        string password_hash "argon2"
        enum bank_role "underwriter | bank_admin | null"
    }
    companies {
        uuid id PK
        enum legal_form "IP | OOO"
        string inn UK
        string ogrn UK
        string okved_main
        enum registry_status
        enum msp_category
    }
    members {
        uuid id PK
        uuid company_id FK
        uuid user_id FK
        enum role "owner, director, cfo_or_accountant, ..."
        string_array permissions
        enum status "active | invited | pending_approval | disabled"
    }
    applications {
        uuid id PK
        string number UK "КЗ-2026-001044"
        uuid company_id FK
        string product_code FK
        bigint requested_amount
        int requested_term_months
        bigint approved_amount
        int approved_term_months
        enum status
        int version "оптимистичная блокировка"
        jsonb form_data "автосохранение черновика"
        jsonb load_at_submit "нагрузка на момент отправки"
        uuid bank_assignee_id FK
        bool auto_decided
    }
    application_events {
        uuid id PK
        uuid application_id FK
        string from_status
        string to_status
        string actor_type "client | bank | system"
        timestamptz at
    }
    check_results {
        uuid id PK
        uuid application_id FK
        string source "registry, credit_bureau, turnover, fns_transparent, load"
        string status "ok | warning | stop | error"
        jsonb details
    }
    scoring_results {
        uuid id PK
        uuid application_id FK
        int total "0-100"
        string outcome
        jsonb payload "факторы и баллы"
    }
    decisions {
        uuid id PK
        uuid application_id FK
        string type "approved | counter_offer | rejected"
        string decided_by "auto | underwriter"
        string text_source "template | llm"
        jsonb payload
    }
    info_requests {
        uuid id PK
        uuid application_id FK
        text question
        string_array document_types
        string status "open | answered"
    }
    documents {
        uuid id PK
        uuid company_id FK
        string document_type
        string origin "upload | alfa_lk"
        int version
        string status
        jsonb analysis "результат ИИ-проверки"
    }
    signing_sessions {
        uuid id PK
        uuid application_id FK
        jsonb signers "очередь подписантов"
        string status
    }
    loans {
        uuid id PK
        uuid company_id FK
        uuid application_id FK
        bigint amount
        numeric rate_percent
        jsonb schedule "график платежей"
    }
```

## Таблицы вне схемы

| Таблица | Назначение |
|---|---|
| `credit_products` | справочник продуктов: оборотный, инвестиционный, овердрафт, кредитная линия, экспресс, на любые цели, госпрограмма |
| `feed_items` | новости ленты с правилами показа в `targeting` (форма бизнеса, префиксы ОКВЭД, сезонность, готовность) |
| `settings` | пороги скоринга и нагрузки, меняет `bank_admin` |
| `audit_log` | журнал действий: кто, что, с какой сущностью |

Redis хранит refresh-сессии (ротация токенов, отзыв при повторном использовании) и счётчики rate limit.
