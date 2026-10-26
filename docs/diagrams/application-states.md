# Диаграмма состояний заявки

Источник правды: `backend/app/domain/state_machine.py`. Недопустимый переход возвращает `409 INVALID_TRANSITION`. Каждый переход пишется в `application_events` (лента событий заявки) и в `audit_log`.

```mermaid
stateDiagram-v2
    [*] --> draft: клиент создаёт заявку<br/>из подбора, каталога или предодобренного предложения

    draft --> submitted: клиент подписал согласия и отправил

    submitted --> in_review: система: автопроверки и скоринг

    in_review --> approved: балл ≥ 70, нет предупреждений (авто)<br/>или аналитик одобрил
    in_review --> counter_offer: аналитик предложил другие условия
    in_review --> info_requested: не хватает обязательных документов (авто)<br/>или аналитик запросил данные
    in_review --> rejected: стоп-фактор или балл < 45 (авто)<br/>или аналитик отказал

    info_requested --> in_review: клиент ответил на все запросы

    approved --> signing: клиент принял условия
    counter_offer --> signing: клиент принял контрпредложение
    counter_offer --> cancelled: клиент отказался

    signing --> issued: подписали все подписанты по правилам компании

    draft --> cancelled: клиент отозвал
    submitted --> cancelled: клиент отозвал
    in_review --> cancelled: клиент отозвал
    info_requested --> cancelled: клиент отозвал
    approved --> cancelled: клиент отозвал
    signing --> cancelled: клиент отозвал

    issued --> [*]
    rejected --> [*]
    cancelled --> [*]
```

## Группы статусов

| Группа | Статусы | Где видно |
|---|---|---|
| Черновики | `draft` | счётчик `drafts` на главной |
| В банке | `submitted`, `in_review`, `info_requested` | `in_bank`, очередь аналитика |
| Ждут подписания | `approved`, `counter_offer`, `signing` | `awaiting_signing` |
| Завершены | `issued`, `rejected`, `cancelled` | `finished` |

## Кто переводит

| Переход | Инициатор | Ручка |
|---|---|---|
| `draft → submitted` | клиент с правом `submit_applications` | `POST /applications/{id}/submit` |
| `submitted → in_review` и авторешение | система, фоновая задача после отправки | `services/review.py: auto_review` |
| `in_review → approved / counter_offer / info_requested / rejected` | аналитик (`underwriter`) | `POST /bank/applications/{id}/decision` |
| `info_requested → in_review` | клиент | `POST /applications/{id}/info-requests/{rid}/respond` |
| `approved / counter_offer → signing` | клиент с правом `accept_offers` | `POST /applications/{id}/offer/accept` |
| `counter_offer → cancelled` | клиент | `POST /applications/{id}/offer/decline` |
| `signing → issued` | последний подписант | `POST /applications/{id}/signing/confirm` |
| `* → cancelled` | клиент | `POST /applications/{id}/cancel` |

При переходе в `issued` создаётся кредит (`loans`) с графом платежей: выдача смоделирована без реальных операций.
