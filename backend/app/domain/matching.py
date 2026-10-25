from dataclasses import dataclass
from typing import Any

from app.domain import texts
from app.domain.catalog import PRODUCTS, rub
from app.domain.facts import CompanyFacts
from app.domain.finance import (
    Thresholds,
    format_percent,
    format_rub,
    load_calc,
    load_percent,
    money,
    monthly_payment,
    overpayment,
)

AMOUNT_STEP = rub(100_000)
OVERDRAFT_INFLOW_SHARE = 0.45


class NoProductsError(Exception):
    pass


@dataclass(frozen=True)
class Option:
    product: dict[str, Any]
    amount: int
    term: int

    @property
    def rate(self) -> float:
        return self.product["rate_from_percent"]

    @property
    def payment(self) -> int:
        return monthly_payment(self.product["code"], self.amount, self.term, self.rate)

    @property
    def overpayment(self) -> int:
        return overpayment(self.product["code"], self.amount, self.term, self.rate)


def eligible(
    p: dict,
    *,
    legal_form: str,
    age_months: int,
    purpose: str | None = None,
    need_type: str | None = None,
    disbursement: str | None = None,
    collateral: str | None = None,
    requested_amount: int | None = None,
) -> bool:
    if legal_form not in p["legal_forms"] or age_months < p["min_business_age_months"]:
        return False
    if p["collateral"] == "required" and collateral in (None, "none"):
        return False
    if purpose is not None and purpose not in p["purposes"]:
        return False
    if need_type is not None and need_type not in p["need_types"]:
        return False
    if disbursement is not None and disbursement not in p["disbursement"]:
        return False
    if requested_amount is not None and requested_amount < p["amount_min"]:
        return False
    return True


def priority(p: dict, need: dict) -> int:
    code = p["code"]
    if need.get("need_type") == "recurring" or need.get("disbursement") == "tranches":
        return 0 if code in ("overdraft", "credit_line") else 1
    if need.get("purpose") == "equipment":
        return 0 if code in ("any_purpose", "investment") else 1
    if need.get("purpose") == "gov_contract":
        return 0 if code in ("credit_line", "working_capital") else 1
    return 1


def clamp_term(p: dict, term: int) -> int:
    return min(max(term, p["term_min_months"]), p["term_max_months"])


def overdraft_limit(inflow_avg: int, p: dict) -> int:
    limit = int(inflow_avg * OVERDRAFT_INFLOW_SHARE) // AMOUNT_STEP * AMOUNT_STEP
    return min(limit, p["amount_max"])


def option_load(o: Option, facts: CompanyFacts) -> float:
    return load_percent(o.payment, facts.current_payments or 0, facts.free_cash_flow or 0)


def best_fit(
    p: dict, amount: int, term: int, facts: CompanyFacts, max_load: float, extra_terms: int = 1
) -> Option | None:
    if p["code"] == "overdraft":
        limit = min(overdraft_limit(facts.monthly_inflow_avg or 0, p), amount)
        if limit < p["amount_min"]:
            return None
        o = Option(p, limit, p["term_max_months"])
        return o if option_load(o, facts) <= max_load else None

    terms = sorted({clamp_term(p, term + 12 * i) for i in range(extra_terms + 1)})
    start = min(amount, p["amount_max"])
    best: Option | None = None
    for t in terms:
        a = start
        while a >= p["amount_min"]:
            o = Option(p, a, t)
            if option_load(o, facts) <= max_load:
                if best is None or a > best.amount:
                    best = o
                break
            a -= AMOUNT_STEP
    return best


def requested_option(p: dict, amount: int, term: int, facts: CompanyFacts) -> Option:
    if p["code"] == "overdraft":
        return Option(p, min(amount, p["amount_max"]), p["term_max_months"])
    return Option(p, min(max(amount, p["amount_min"]), p["amount_max"]), clamp_term(p, term))


def readiness_ok(readiness_items: list[dict]) -> bool:
    return all(i["status"] == "ok" for i in readiness_items if i["code"] not in ("documents", "debt_load"))


def fit(load: float, t: Thresholds, ready: bool) -> tuple[str, str]:
    if load <= t.load_target_percent and ready:
        return "high", texts.FIT_LABELS["high"]
    if load <= t.load_threshold_percent:
        label = texts.FIT_LABEL_BORDER if load > t.load_target_percent else texts.FIT_LABELS["medium"]
        return "medium", label
    return "low", texts.FIT_LABELS["low"]


def reason(code: str, value: str, data_ref: str | None) -> dict:
    return {"code": code, "text": texts.reason_text(code, value), "data_ref": data_ref}


def base_reasons(need: dict, facts: CompanyFacts) -> list[dict]:
    reasons = [reason("purpose", texts.purpose_title(need.get("purpose")), "need.purpose")]
    if facts.free_cash_flow and facts.free_cash_flow > 0:
        reasons.append(reason("free_cash_flow", format_rub(facts.free_cash_flow), "finance.free_cash_flow"))
    reasons.append(
        reason("business_age", texts.business_age_value(facts.business_age_months), "company.registration_date")
    )
    if facts.bki_available and not facts.overdue_days_current and not facts.max_overdue_days_12m:
        reasons.append(reason("credit_history", "без просрочек", "bki"))
    return reasons[:4]


def recommendation(rank: int, o: Option, facts: CompanyFacts, t: Thresholds, ready: bool, reasons: list[dict]) -> dict:
    load = load_calc(facts.free_cash_flow or 0, facts.current_payments or 0, o.payment, t)
    level, label = fit(load["load_percent"], t, ready)
    return {
        "rank": rank,
        "product": {"code": o.product["code"], "name": o.product["name"], "is_fictional": o.product["is_fictional"]},
        "amount": money(o.amount),
        "term_months": o.term,
        "rate_percent": o.rate,
        "monthly_payment": money(o.payment),
        "overpayment": money(o.overpayment),
        "load": load,
        "fit": level,
        "fit_label": label,
        "reasons": reasons,
    }


def candidates(need: dict, facts: CompanyFacts) -> list[dict]:
    common = {
        "legal_form": facts.legal_form,
        "age_months": facts.business_age_months,
        "collateral": need.get("collateral"),
    }
    strict = [
        p
        for p in PRODUCTS
        if eligible(
            p,
            **common,
            purpose=need.get("purpose"),
            need_type=need.get("need_type"),
            disbursement=need.get("disbursement"),
            requested_amount=None,
        )
    ]
    if strict:
        return strict
    relaxed = [p for p in PRODUCTS if eligible(p, **common)]
    if not relaxed:
        raise NoProductsError
    return relaxed


def pick_primary(options: list[Option], need: dict, extra: dict) -> Option:
    preference = extra.get("preference")

    def key(o: Option) -> tuple:
        if preference == "lower_payment":
            tie: Any = o.payment
        elif preference == "flexibility":
            tie = 0 if o.product["code"] in ("overdraft", "credit_line") else 1
        else:
            tie = o.overpayment
        return (-o.amount, tie, priority(o.product, need), o.term)

    return sorted(options, key=key)[0]


def recommend(
    need: dict, extra: dict, facts: CompanyFacts, t: Thresholds, readiness_items: list[dict], stale_text: str | None
) -> dict:
    amount = need["amount"]["value"]
    term = need["term_months"]
    ready = readiness_ok(readiness_items)
    products = sorted(candidates(need, facts), key=lambda p: priority(p, need))

    fitted = [o for p in products if (o := best_fit(p, amount, term, facts, t.load_target_percent))]
    if fitted:
        primary_opt = pick_primary(fitted, need, extra)
    else:
        fallback = [requested_option(p, amount, p["term_max_months"], facts) for p in products]
        primary_opt = min(fallback, key=lambda o: (option_load(o, facts), priority(o.product, need)))

    req_opt = requested_option(primary_opt.product, amount, term, facts)
    requested_load = load_calc(facts.free_cash_flow or 0, facts.current_payments or 0, req_opt.payment, t)

    primary_reasons = base_reasons(need, facts)
    primary = recommendation(1, primary_opt, facts, t, ready, primary_reasons)

    alternatives: list[dict] = []
    p = primary_opt.product

    if p["code"] != "overdraft" and min(amount, p["amount_max"]) > primary_opt.amount:
        alt = Option(p, min(amount, p["amount_max"]), clamp_term(p, term + 12))
        alt_load = option_load(alt, facts)
        if alt_load <= t.load_threshold_percent:
            alternatives.append(
                recommendation(
                    len(alternatives) + 2,
                    alt,
                    facts,
                    t,
                    ready,
                    [
                        reason("as_requested", format_rub(alt.amount), "need.amount"),
                        reason("load", f"{format_percent(alt_load)}%", "finance.free_cash_flow"),
                    ],
                )
            )

    if p["code"] != "overdraft":
        od = next(x for x in PRODUCTS if x["code"] == "overdraft")
        if eligible(od, legal_form=facts.legal_form, age_months=facts.business_age_months) and (
            need.get("purpose") in od["purposes"] or need.get("need_type") == "recurring"
        ):
            od_opt = best_fit(od, od["amount_max"], 12, facts, t.load_threshold_percent)
            if od_opt:
                alternatives.append(
                    recommendation(
                        len(alternatives) + 2,
                        od_opt,
                        facts,
                        t,
                        ready,
                        [
                            reason("flexible", "", None),
                            reason("load", f"{format_percent(option_load(od_opt, facts))}%", "finance.free_cash_flow"),
                        ],
                    )
                )

    if need.get("collateral") not in (None, "none"):
        for cp in PRODUCTS:
            if cp["collateral"] != "required" or cp["code"] == p["code"]:
                continue
            if not eligible(
                cp,
                legal_form=facts.legal_form,
                age_months=facts.business_age_months,
                purpose=need.get("purpose"),
                collateral=need.get("collateral"),
            ):
                continue
            c_opt = best_fit(cp, amount, term, facts, t.load_threshold_percent)
            if c_opt:
                alternatives.append(
                    recommendation(
                        len(alternatives) + 2,
                        c_opt,
                        facts,
                        t,
                        ready,
                        [reason("collateral", "ставка ниже", "need.collateral")],
                    )
                )
            break

    warnings = []
    if requested_load["load_percent"] > t.load_threshold_percent:
        warnings.append(
            {
                "code": "LOAD_ABOVE_THRESHOLD",
                "text": texts.warning_load_above_threshold(
                    amount,
                    term,
                    requested_load["load_percent"],
                    t.load_threshold_percent,
                    primary_opt.amount,
                    primary_opt.term,
                    primary["load"]["load_percent"],
                ),
                "suggested": {"amount": money(primary_opt.amount), "term_months": primary_opt.term},
            }
        )
    if primary_opt.term > term and p["code"] != "overdraft":
        warnings.append(
            {"code": "TERM_EXTENDED", "text": texts.warning_term_extended(primary_opt.term), "suggested": None}
        )
    if p["collateral"] == "required":
        warnings.append({"code": "COLLATERAL_NEEDED", "text": texts.warning_collateral_needed(), "suggested": None})
    if facts.free_cash_flow is not None and facts.free_cash_flow <= 0:
        warnings.append({"code": "DATA_STALE", "text": texts.warning_negative_cash_flow(), "suggested": None})
    elif stale_text:
        warnings.append({"code": "DATA_STALE", "text": stale_text, "suggested": None})

    return {
        "is_preliminary": bool(extra.get("skipped")),
        "primary": primary,
        "alternatives": alternatives[:2],
        "requested": {"amount": money(amount), "term_months": term, "load": requested_load},
        "warnings": warnings,
        "submit_requirements_text": texts.submit_requirements_text(facts.legal_form),
        "text_source": texts.TEMPLATE,
    }


def counter_offer_options(
    product_code: str,
    purpose: str | None,
    amount: int,
    term: int,
    facts: CompanyFacts,
    t: Thresholds,
    score_for_load,
) -> list[dict]:
    products = [x for x in PRODUCTS if x["code"] == product_code]
    products += [
        x
        for x in PRODUCTS
        if x["code"] != product_code
        and x["code"] != "overdraft"
        and eligible(x, legal_form=facts.legal_form, age_months=facts.business_age_months, purpose=purpose)
    ]
    seen = set()
    options = []
    for p in products:
        if p["code"] == "overdraft":
            terms = [p["term_max_months"]]
        else:
            terms = sorted({clamp_term(p, term + 12 * i) for i in range(3)})
        for tm in terms:
            o = best_fit(p, amount, tm, facts, t.load_target_percent, extra_terms=0)
            if not o or (o.product["code"], o.amount, o.term) in seen:
                continue
            load = load_calc(facts.free_cash_flow or 0, facts.current_payments or 0, o.payment, t)
            total = score_for_load(load["load_percent"])
            if total < t.approve_min:
                continue
            seen.add((o.product["code"], o.amount, o.term))
            options.append(
                {
                    "product_code": o.product["code"],
                    "amount": money(o.amount),
                    "term_months": o.term,
                    "monthly_payment": money(o.payment),
                    "load": load,
                    "score": total,
                }
            )
    options.sort(key=lambda x: (-x["amount"]["value"], x["term_months"], x["product_code"] != product_code))
    return options[:3]
