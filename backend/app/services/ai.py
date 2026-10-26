import base64
import io
import logging
import re
import shutil
import subprocess
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.config import settings
from app.domain import texts
from app.domain.catalog import DOCUMENT_TYPES, DOCUMENT_TYPES_BY_CODE
from app.integrations import llm
from app.integrations.llm import ANALYST_PROMPT, EXTRACT_PROMPT, SYSTEM_PROMPT

log = logging.getLogger(__name__)

LLM = "llm"
FORBIDDEN_WORDS = ("отказ", "отклон")


def rubles(kopecks: int) -> int:
    return round(kopecks / 100)


class I4Reason(BaseModel):
    code: str
    text: str = Field(max_length=60)


class I4Output(BaseModel):
    reasons: list[I4Reason] = Field(min_length=1, max_length=4)
    warning_text: str | None


async def recommendation_texts(result: dict, threshold: float, target: float) -> dict:
    primary = result["primary"]
    warning = next((w for w in result["warnings"] if w["code"] == "LOAD_ABOVE_THRESHOLD"), None)
    requested = result["requested"]
    data = {
        "product_name": primary["product"]["name"],
        "amount_rub": rubles(primary["amount"]["value"]),
        "term_months": primary["term_months"],
        "monthly_payment_rub": rubles(primary["monthly_payment"]["value"]),
        "facts": [{"code": r["code"], "value": r["text"]} for r in primary["reasons"]],
        "requested": {
            "amount_rub": rubles(requested["amount"]["value"]),
            "term_months": requested["term_months"],
            "load_percent": requested["load"]["load_percent"],
        }
        if warning
        else None,
        "threshold_percent": threshold,
        "target_load_percent": target,
        "primary_load_percent": primary["load"]["load_percent"],
    }
    answer = await llm.client.complete(
        "I4",
        data,
        I4Output,
        system=SYSTEM_PROMPT
        + "\nНапиши по одной причине на каждый факт из facts с тем же code: почему продукт подходит, до 60 символов."
        + "\nЕсли передан requested, напиши warning_text до 250 символов: на запрошенные сумму и срок платежи по всем"
        + " кредитам займут requested.load_percent% свободного денежного потока при пороге threshold_percent%,"
        + " а с предложенной суммой amount_rub на term_months мес нагрузка primary_load_percent%."
        + " Если requested = null, warning_text = null.",
        check_numbers=True,
    )
    if not answer.ok:
        return result
    by_code = {r.code: r.text for r in answer.output.reasons}
    if any(r["code"] not in by_code for r in primary["reasons"]):
        return result
    primary["reasons"] = [r | {"text": by_code[r["code"]]} for r in primary["reasons"]]
    if warning and answer.output.warning_text:
        warning["text"] = answer.output.warning_text
    result["text_source"] = LLM
    return result


class I5Output(BaseModel):
    explanation_text: str = Field(max_length=300)
    improve_tips: list[str] = Field(max_length=3)

    @field_validator("explanation_text")
    @classmethod
    def no_refusal_words(cls, value: str) -> str:
        if any(word in value.lower() for word in FORBIDDEN_WORDS):
            raise ValueError("слова с отказом запрещены")
        return value


async def decision_texts(payload: dict) -> dict:
    offered = payload["offered"]
    data = {
        "decision_type": payload["type"],
        "requested": {
            "amount_rub": rubles(payload["requested"]["amount"]["value"]),
            "term_months": payload["requested"]["term_months"],
        },
        "offered": {
            "amount_rub": rubles(offered["amount"]["value"]),
            "term_months": offered["term_months"],
            "monthly_payment_rub": rubles(offered["monthly_payment"]["value"]),
        }
        if offered
        else None,
        "factors": [{"code": f["code"], "impact": f["impact"], "value": f["text"]} for f in payload["factors"]],
        "template_text": payload["explanation_text"],
    }
    answer = await llm.client.complete(
        "I5",
        data,
        I5Output,
        system=SYSTEM_PROMPT
        + "\nОбъясни клиенту решение банка: 2-3 коротких предложения, всего до 300 символов."
        + " Опирайся на template_text и factors. Не пиши «отклонено», «отказ»: говори, что банк может предложить."
        + "\nimprove_tips: 0-3 конкретных действия по негативным факторам, каждое до 100 символов;"
        + " при approved пустой список.",
        check_numbers=True,
    )
    if not answer.ok:
        return payload
    payload["explanation_text"] = answer.output.explanation_text
    if payload["type"] != "approved":
        payload["improve_tips"] = answer.output.improve_tips or payload["improve_tips"]
    payload["text_source"] = LLM
    return payload


class I6Tip(BaseModel):
    code: str
    how_to_improve: str = Field(max_length=200)


class I6Output(BaseModel):
    tips: list[I6Tip]
    summary_text: str = Field(max_length=200)


async def readiness_texts(full: dict) -> dict:
    data = {
        "level": full["level"],
        "template_summary": full["summary_text"],
        "items": [{"code": i["code"], "status": i["status"], "value_text": i["value_text"]} for i in full["items"]],
    }
    answer = await llm.client.complete(
        "I6",
        data,
        I6Output,
        system=SYSTEM_PROMPT
        + "\nДля каждого пункта со статусом warning или fail дай совет how_to_improve с тем же code, до 150 символов."
        + "\nsummary_text: одно предложение до 150 символов об общей готовности к кредиту по смыслу template_summary,"
        + " без обещаний одобрения.",
        check_numbers=True,
    )
    if not answer.ok:
        return full
    tips = {t.code: t.how_to_improve for t in answer.output.tips}
    for item in full["items"]:
        if item["how_to_improve"] is not None and item["code"] in tips:
            item["how_to_improve"] = tips[item["code"]]
    full["summary_text"] = answer.output.summary_text
    full["text_source"] = LLM
    return full


class I7Output(BaseModel):
    text: str = Field(max_length=600)
    risks: list[str] = Field(max_length=4)
    to_check: list[str] = Field(max_length=4)


async def analyst_summary(data: dict, template: dict) -> dict:
    answer = await llm.client.complete(
        "I7",
        data,
        I7Output,
        system=SYSTEM_PROMPT
        + "\n"
        + ANALYST_PROMPT
        + "\noutcome: рекомендация скоринга, а не решение. Не пиши, что кредит одобрен или не одобрен."
        + "\ntext: 2-3 предложения до 400 символов: сумма и срок, нагрузка против порога, балл, сезонность;"
        + " опирайся на facts_text. risks и to_check: по 0-4 коротких пункта до 100 символов.",
        check_numbers=True,
    )
    if not answer.ok:
        return template
    return template | answer.output.model_dump() | {"text_source": LLM}


MIN_TYPE_CONFIDENCE = 0.6
MIN_FIELD_CONFIDENCE = 0.5
MAX_TEXT_CHARS = 8000
MAX_PDF_PAGES = 5
NO_LLM_TYPES = {"passport"}

FieldType = Literal["string", "date", "money", "inn"]
COMMON_FIELDS: list[dict] = [
    {"key": "inn", "label": "ИНН организации", "type": "inn"},
    {"key": "organization", "label": "Организация", "type": "string"},
    {"key": "document_date", "label": "Дата документа", "type": "date"},
]
PERIOD_FIELDS: list[dict] = [
    {"key": "period_from", "label": "Начало периода", "type": "date"},
    {"key": "period_to", "label": "Конец периода", "type": "date"},
]
EXTRA_FIELDS: dict[str, list[dict]] = {
    "fin_statements_2025": [*PERIOD_FIELDS, {"key": "revenue", "label": "Выручка", "type": "money"}],
    "tax_return": [*PERIOD_FIELDS, {"key": "income", "label": "Доходы", "type": "money"}],
    "other_bank_statements": [*PERIOD_FIELDS, {"key": "turnover", "label": "Поступления за период", "type": "money"}],
    "bank_statement": [*PERIOD_FIELDS, {"key": "turnover", "label": "Поступления за период", "type": "money"}],
    "turnover_statement": [*PERIOD_FIELDS, {"key": "turnover", "label": "Обороты за период", "type": "money"}],
}


def type_fields(code: str) -> list[dict]:
    return [*COMMON_FIELDS, *EXTRA_FIELDS.get(code, [])]


def allowed_types() -> list[dict]:
    return [
        {"code": t["code"], "title": t["title"], "fields": type_fields(t["code"])}
        for t in DOCUMENT_TYPES
        if t["code"] not in NO_LLM_TYPES
    ]


class I1Field(BaseModel):
    key: str
    value: str
    confidence: float = Field(ge=0, le=1)


class I1Output(BaseModel):
    detected_type: str | None
    confidence: float = Field(ge=0, le=1)
    fields: list[I1Field]


class I3Issue(BaseModel):
    code: str
    severity: Literal["info", "warning", "error"]
    text: str = Field(max_length=200)


class I3Output(BaseModel):
    issues: list[I3Issue]


def pdf_text(content: bytes) -> str:
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(io.BytesIO(content))
        return "\n".join((page.extract_text() or "") for page in reader.pages[:MAX_PDF_PAGES]).strip()
    except (PyPdfError, ValueError, KeyError, TypeError) as e:
        log.info("pdf text extraction failed: %s", e)
        return ""


def ocr_text(content: bytes) -> str:
    if not shutil.which("tesseract"):
        return ""
    try:
        done = subprocess.run(
            ["tesseract", "stdin", "stdout", "-l", "rus+eng"],
            input=content,
            capture_output=True,
            timeout=60,
            check=True,
        )
    except (subprocess.SubprocessError, OSError) as e:
        log.info("tesseract failed: %s", e)
        return ""
    return done.stdout.decode("utf-8", errors="ignore").strip()


def plain_text(content: bytes) -> str:
    for encoding in ("utf-8", "cp1251"):
        try:
            return content.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    return ""


def parse_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat((value or "").strip()[:10])
    except ValueError:
        return None


def digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def code_checks(
    fields: dict[str, str], doc_type: str, requested_types: list[str] | None, company_inn: str, today: date
) -> list[dict]:
    checks = []
    if requested_types:
        checks.append(
            {
                "code": "type_match",
                "passed": doc_type in requested_types,
                "expected": ", ".join(requested_types),
                "actual": doc_type,
            }
        )
    if fields.get("inn"):
        checks.append(
            {
                "code": "inn_match",
                "passed": digits(fields["inn"]) == company_inn,
                "expected": company_inn,
                "actual": digits(fields["inn"]),
            }
        )
    max_age = DOCUMENT_TYPES_BY_CODE.get(doc_type, {}).get("max_age_days")
    doc_date = parse_date(fields.get("document_date"))
    if doc_date and max_age:
        age = (today - doc_date).days
        checks.append(
            {
                "code": "not_expired",
                "passed": age <= max_age,
                "expected": f"не старше {max_age} дней",
                "actual": f"{age} дней",
            }
        )
    start, end = parse_date(fields.get("period_from")), parse_date(fields.get("period_to"))
    if start and end:
        fresh = not max_age or (today - end).days <= max_age
        checks.append(
            {
                "code": "period_valid",
                "passed": start <= end and fresh,
                "expected": f"конец периода не раньше чем {max_age} дней назад" if max_age else "начало раньше конца",
                "actual": f"{start.isoformat()} - {end.isoformat()}",
            }
        )
    return checks


PASSED_TEXTS = {
    "type_match": "Тип документа совпадает с запрошенным",
    "inn_match": "ИНН совпадает с ИНН компании",
    "not_expired": "Документ свежий",
    "period_valid": "Период документа подходит",
}


def template_issue(check: dict, max_age: int | None) -> str:
    return texts.ISSUE_TEXTS[check["code"]].format(days=max_age or "")


async def issue_texts(checks: list[dict], document_title: str, max_age: int | None) -> tuple[dict[str, str], bool]:
    failed = [c for c in checks if c["passed"] is False]
    result = {c["code"]: template_issue(c, max_age) for c in failed}
    if not failed:
        return result, False
    answer = await llm.client.complete(
        "I3",
        {"checks": failed, "document_title": document_title},
        I3Output,
        system=SYSTEM_PROMPT
        + "\nСформулируй замечание по каждой проверке из checks с тем же code: что не так и что сделать,"
        + " одно-два предложения до 150 символов.",
        check_numbers=True,
    )
    if not answer.ok:
        return result, False
    by_code = {i.code: i.text for i in answer.output.issues if i.code in result}
    if set(by_code) != set(result):
        return result, False
    return by_code, True


async def extract(content: bytes, fmt: str) -> tuple[llm.LlmResult | None, str | None]:
    data: dict = {"allowed_types": allowed_types()}
    if fmt in ("png", "jpg") and settings.llm_model_vision:
        answer = await llm.client.complete(
            "I2",
            data,
            I1Output,
            system=EXTRACT_PROMPT,
            model=settings.llm_model_vision,
            images=[base64.b64encode(content).decode()],
        )
        if answer.ok:
            return answer, "I2"
    if fmt == "pdf":
        text = pdf_text(content)
    elif fmt in ("txt", "xml"):
        text = plain_text(content)
    elif fmt in ("png", "jpg"):
        text = ocr_text(content)
    else:
        text = ""
    if not text:
        return None, None
    data["text"] = text[:MAX_TEXT_CHARS]
    return await llm.client.complete("I1", data, I1Output, system=EXTRACT_PROMPT), "I1"


async def analyze_document(
    *,
    content: bytes,
    fmt: str,
    doc_type: str,
    requested_types: list[str] | None,
    company_inn: str,
    today: date,
) -> dict | None:
    if not settings.llm_enabled or doc_type in NO_LLM_TYPES:
        return None
    answer, _ = await extract(content, fmt)
    if answer is None or not answer.ok:
        return None
    out: I1Output = answer.output
    known_types = {t["code"] for t in allowed_types()}
    detected = out.detected_type if out.detected_type in known_types else None
    effective_type = doc_type
    if doc_type == "other" and detected and out.confidence >= MIN_TYPE_CONFIDENCE:
        effective_type = detected
    specs = {f["key"]: f for f in type_fields(detected or effective_type)}
    fields = [f for f in out.fields if f.key in specs and f.value.strip() and f.confidence >= MIN_FIELD_CONFIDENCE]
    values = {f.key: f.value.strip() for f in fields}

    checks = code_checks(values, effective_type, requested_types, company_inn, today)
    max_age = DOCUMENT_TYPES_BY_CODE.get(effective_type, {}).get("max_age_days")
    title = DOCUMENT_TYPES_BY_CODE.get(effective_type, {}).get("title", "Документ")
    issue_by_code, issues_by_llm = await issue_texts(checks, title, max_age)
    issues = [
        {
            "severity": "error" if c["code"] in ("inn_match", "type_match") else "warning",
            "text": issue_by_code[c["code"]],
        }
        for c in checks
        if c["passed"] is False
    ]
    if detected is None or out.confidence < MIN_TYPE_CONFIDENCE:
        issues.append({"severity": "info", "text": "Тип документа не удалось определить уверенно, проверьте его"})
    return {
        "status": "done",
        "detected_type": detected,
        "detected_type_confidence": round(out.confidence, 2) if detected else None,
        "extracted_fields": [
            {
                "key": f.key,
                "label": specs[f.key]["label"],
                "value": f.value.strip(),
                "confidence": round(f.confidence, 2),
            }
            for f in fields
        ],
        "checks": [
            {
                "code": c["code"],
                "passed": c["passed"],
                "text": PASSED_TEXTS[c["code"]] if c["passed"] else issue_by_code[c["code"]],
            }
            for c in checks
        ],
        "issues": issues,
        "model": answer.model,
        "text_source": LLM if issues_by_llm or not checks or all(c["passed"] for c in checks) else texts.TEMPLATE,
    }


def read_file(path: str | None) -> bytes | None:
    if not path or not Path(path).exists():
        return None
    return Path(path).read_bytes()
