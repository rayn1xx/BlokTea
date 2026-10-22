"""Явная машина состояний заявки (раздел К.16 ТЗ). Любой другой переход: 409 INVALID_TRANSITION."""

DRAFT = "draft"
SUBMITTED = "submitted"
IN_REVIEW = "in_review"
INFO_REQUESTED = "info_requested"
APPROVED = "approved"
COUNTER_OFFER = "counter_offer"
REJECTED = "rejected"
SIGNING = "signing"
ISSUED = "issued"
CANCELLED = "cancelled"

CANCELLABLE = (DRAFT, SUBMITTED, IN_REVIEW, INFO_REQUESTED, APPROVED, COUNTER_OFFER, SIGNING)

TRANSITIONS: set[tuple[str, str]] = {
    (DRAFT, SUBMITTED),
    (SUBMITTED, IN_REVIEW),
    (IN_REVIEW, APPROVED),
    (IN_REVIEW, COUNTER_OFFER),
    (IN_REVIEW, INFO_REQUESTED),
    (IN_REVIEW, REJECTED),
    (INFO_REQUESTED, IN_REVIEW),
    (APPROVED, SIGNING),
    (COUNTER_OFFER, SIGNING),
    (COUNTER_OFFER, CANCELLED),
    (SIGNING, ISSUED),
    *((status, CANCELLED) for status in CANCELLABLE),
}

# группы статусов для счётчиков на S5 и очереди банка
DRAFTS = (DRAFT,)
IN_BANK = (SUBMITTED, IN_REVIEW, INFO_REQUESTED)
AWAITING_SIGNING = (APPROVED, COUNTER_OFFER, SIGNING)
FINISHED = (ISSUED, REJECTED, CANCELLED)

# у этих статусов есть одобренные сумма и срок
DECIDED = (APPROVED, COUNTER_OFFER, SIGNING, ISSUED)


def can_transition(current: str, target: str) -> bool:
    return (current, target) in TRANSITIONS
