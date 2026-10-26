# Архитектурная схема

```mermaid
flowchart LR
    subgraph Browser["Браузер"]
        UI["Веб-кабинет клиента<br/>и рабочее место аналитика<br/>React 18 + Core DS"]
    end

    subgraph Compose["docker compose"]
        FE["frontend<br/>nginx: статика + прокси /api"]
        BE["backend<br/>FastAPI, Python 3.12"]
        DB[("db<br/>PostgreSQL 16")]
        RD[("redis<br/>refresh-сессии, rate limit")]
        MK["mocks<br/>FastAPI: внешние системы"]
        OL["ollama (профиль llm)<br/>Qwen3.5 9B, открытые веса"]
        VOL[("том uploads<br/>файлы документов")]
    end

    UI -->|HTTP :8080| FE
    FE -->|/api/v1| BE
    BE -->|SQLAlchemy async| DB
    BE --> RD
    BE --> VOL
    BE -->|httpx, таймаут, кеш на запрос| MK
    BE -.->|JSON по схеме, таймаут, откат на шаблоны| OL

    MK --- AB["Альфа-Бизнес Онлайн:<br/>счета, операции, кредиты, выписки"]
    MK --- EG["ЕГРЮЛ / ЕГРИП"]
    MK --- MSP["Реестр МСП"]
    MK --- BKI["БКИ"]
    MK --- FNS["ФНС «Прозрачный бизнес»"]
```

## Слои бэкенда

```mermaid
flowchart TB
    API["api/v1<br/>роутеры, права, rate limit"] --> SVC["services<br/>сценарии: заявки, проверка, подбор,<br/>документы, подписание, лента"]
    SVC --> DOM["domain<br/>чистые правила: state machine, скоринг,<br/>нагрузка, подбор, готовность, тексты"]
    SVC --> REPO["db / models<br/>SQLAlchemy, Alembic"]
    SVC --> INT["integrations<br/>external.py: моки внешних систем<br/>llm.py: клиент Ollama"]
```

| Слой | Папка | Что делает |
|---|---|---|
| API | `backend/app/api/v1` | HTTP-контракты, авторизация (JWT access + refresh в HttpOnly cookie), проверка прав по роли, rate limit на вход и коды |
| Сервисы | `backend/app/services` | Сценарии конвейера: подача, автопроверки и авторешение (`review.py`), решение аналитика (`bank.py`), подписание, документы, лента |
| Домен | `backend/app/domain` | Правила без ввода-вывода: переходы статусов, скоринг, нагрузка, подбор продукта. Покрыты unit-тестами |
| Данные | `backend/app/models`, `backend/migrations` | PostgreSQL, миграции Alembic применяются при старте контейнера |
| Интеграции | `backend/app/integrations` | Клиент внешних систем (моки) и LLM. Сбой источника не роняет процесс: проверка получает статус `error`, заявка уходит аналитику |
| Моки | `backend/mocks` | Отдельный сервис с синтетическими данными. `MOCKS_DOWN=bki,fns` выключает системы для сценария «источник недоступен» |

## Где работает ИИ

LLM не принимает кредитное решение: баллы, суммы и статус считает код. Модель извлекает поля из документов и формулирует тексты для клиента и аналитика. Числа в ответе модели сверяются со входом, при расхождении, ошибке или таймауте используется шаблон. Подробно: [docs/llm.md](../llm.md).
