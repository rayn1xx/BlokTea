"""Документы (К.12). Тип файла проверяется по сигнатуре, имя файла пользователя в путь не попадает.

Анализ документов (И1-И3) пока на заглушке: без LLM тип выбирает пользователь, проверка ручная.
"""

import re
import uuid
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import forbidden, not_found, validation
from app.domain import texts
from app.domain.catalog import DOCUMENT_TYPES, DOCUMENT_TYPES_BY_CODE, FROM_LK_KINDS, document_title
from app.domain.finance import format_rub, payment_schedule
from app.integrations.external import ExternalSystems, IntegrationUnavailable
from app.models import Application, Company, Document, InfoRequest
from app.services.application_view import SIGN_DOC_TITLES
from app.services.common import ClientContext, People, iso, now, today
from app.services.company_data import CompanyData, effective_document_status

CONTENT_TYPES = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xml": "application/xml",
    "txt": "text/plain; charset=utf-8",
}


def detect_format(head: bytes) -> str | None:
    """Формат по сигнатуре файла, а не по расширению."""
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head.startswith(b"PK\x03\x04"):
        return "xlsx"
    stripped = head.lstrip(b"\xef\xbb\xbf \t\r\n")
    if stripped.startswith(b"<?xml"):
        return "xml"
    if b"\x00" not in head:
        for encoding in ("utf-8", "cp1251"):
            try:
                head.decode(encoding)
                return "txt"
            except UnicodeDecodeError:
                continue
    return None


def safe_file_name(name: str | None) -> str:
    base = Path(name or "document").name
    return re.sub(r"[\x00-\x1f/\\]", "_", base)[:200] or "document"


def stub_analysis(doc: Document, requested_types: list[str] | None) -> dict:
    """Анализ без LLM: только проверки, которые делает код; остальное проверит сотрудник."""
    checks = []
    issues = [{"severity": "info", "text": texts.MANUAL_CHECK_TEXT}]
    if requested_types:
        passed = doc.document_type in requested_types
        checks.append(
            {
                "code": "type_match",
                "passed": passed,
                "text": "Тип документа совпадает с запрошенным" if passed else texts.ISSUE_TEXTS["type_match"],
            }
        )
        if not passed:
            issues.insert(0, {"severity": "warning", "text": texts.ISSUE_TEXTS["type_match"]})
    return {
        "status": "unavailable",
        "detected_type": None,
        "detected_type_confidence": None,
        "extracted_fields": [],
        "checks": checks,
        "issues": issues,
        "model": None,
        "text_source": texts.TEMPLATE,
        "analyzed_at": iso(now()),
    }


def document_types(legal_form: str | None, product_code: str | None) -> list[dict]:
    return [
        t
        for t in DOCUMENT_TYPES
        if (not legal_form or legal_form in t["legal_forms"])
        and (not product_code or not t["required_for_products"] or product_code in t["required_for_products"])
    ]


class DocumentService:
    def __init__(self, session: AsyncSession, external: ExternalSystems) -> None:
        self.session = session
        self.external = external

    def view(self, doc: Document, people: People) -> dict:
        status, reason = effective_document_status(doc, today())
        return {
            "id": str(doc.id),
            "document_type": doc.document_type,
            "title": doc.title,
            "scope": doc.scope,
            "application_id": str(doc.application_id) if doc.application_id else None,
            "info_request_id": str(doc.info_request_id) if doc.info_request_id else None,
            "file_name": doc.file_name,
            "size_bytes": doc.size_bytes,
            "version": doc.version,
            "uploaded_by": people.person(doc.uploaded_by) or {"user_id": "", "name": "Альфа-Бизнес", "role": "owner"},
            "uploaded_at": iso(doc.uploaded_at),
            "origin": doc.origin,
            "status": status,
            "status_reason": reason,
            "expires_at": iso(doc.expires_at),
            "analysis": doc.analysis,
        }

    async def views(self, ctx_company: Company, docs: list[Document]) -> list[dict]:
        people = await People.load(self.session, ctx_company)
        return [self.view(d, people) for d in docs]

    async def get(self, ctx: ClientContext, doc_id: uuid.UUID) -> Document:
        doc = await self.session.get(Document, doc_id)
        if doc is None or doc.company_id != ctx.company.id:
            raise not_found("Документ не найден")
        return doc

    async def list(
        self, ctx: ClientContext, scope: str | None, application_id: uuid.UUID | None, status: str | None
    ) -> list[dict]:
        filters = [Document.company_id == ctx.company.id]
        if scope:
            filters.append(Document.scope == scope)
        if application_id:
            filters.append(Document.application_id == application_id)
        docs = list(await self.session.scalars(select(Document).where(*filters).order_by(Document.uploaded_at.desc())))
        items = await self.views(ctx.company, docs)
        return [i for i in items if not status or i["status"] == status]

    async def missing(self, ctx: ClientContext) -> dict:
        data = CompanyData(self.session, self.external, ctx.company)
        required, situational = await data.document_gaps()
        items = [
            {
                "document_type": code,
                "title": document_title(code),
                "reason": "Обязательный документ компании",
                "application_id": None,
            }
            for code in required
        ]
        items += [
            {
                "document_type": code,
                "title": document_title(code),
                "reason": "Подтверждает выручку и помогает получить большую сумму",
                "application_id": None,
            }
            for code in situational
        ]
        rows = await self.session.execute(
            select(InfoRequest, Application)
            .join(Application, Application.id == InfoRequest.application_id)
            .where(Application.company_id == ctx.company.id, InfoRequest.status == "open")
        )
        for request, app in rows.all():
            for code in request.document_types or []:
                items.append(
                    {
                        "document_type": code,
                        "title": document_title(code),
                        "reason": f"Банк запросил по заявке {app.number}",
                        "application_id": str(app.id),
                    }
                )
        return {"items": items}

    async def resolve_links(
        self, ctx: ClientContext, application_id: str | None, info_request_id: str | None
    ) -> tuple[Application | None, InfoRequest | None]:
        app = request = None
        if info_request_id:
            try:
                request = await self.session.get(InfoRequest, uuid.UUID(info_request_id))
            except ValueError:
                request = None
            if request is None:
                raise validation("Запрос банка не найден", {"info_request_id": "Не найден"})
            app = await self.session.get(Application, request.application_id)
        elif application_id:
            try:
                app = await self.session.get(Application, uuid.UUID(application_id))
            except ValueError:
                app = None
        if (application_id or info_request_id) and (app is None or app.company_id != ctx.company.id):
            raise validation("Заявка не найдена", {"application_id": "Не найдена"})
        return app, request

    def store(self, company_id: uuid.UUID, doc_id: uuid.UUID, version: int, content: bytes) -> str:
        directory = Path(settings.upload_dir) / str(company_id)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{doc_id}_v{version}"
        path.write_bytes(content)
        return str(path)

    def check_file(self, doc_type: str, content: bytes) -> str:
        spec = DOCUMENT_TYPES_BY_CODE[doc_type]
        if not content:
            raise validation("Файл пустой", {"file": "Выберите файл"})
        if len(content) > spec["max_size_mb"] * 1024 * 1024:
            raise validation(f"Файл больше {spec['max_size_mb']} МБ", {"file": f"Максимум {spec['max_size_mb']} МБ"})
        fmt = detect_format(content[:512])
        if fmt is None or fmt not in spec["accepted_formats"]:
            formats = ", ".join(spec["accepted_formats"]).upper()
            raise validation("Формат файла не подходит", {"file": f"Подходят файлы: {formats}"})
        return fmt

    async def upload(
        self,
        ctx: ClientContext,
        *,
        content: bytes,
        file_name: str | None,
        document_type: str | None,
        scope: str | None,
        application_id: str | None,
        info_request_id: str | None,
    ) -> dict:
        ctx.require("upload_documents", "Загружать документы могут сотрудники с правом загрузки")
        doc_type = document_type or "other"
        if doc_type not in DOCUMENT_TYPES_BY_CODE:
            raise validation("Неизвестный тип документа", {"document_type": "Выберите тип из списка"})
        fmt = self.check_file(doc_type, content)
        app, request = await self.resolve_links(ctx, application_id, info_request_id)
        doc_scope = scope if scope in ("company", "application") else DOCUMENT_TYPES_BY_CODE[doc_type]["scope"]
        doc = Document(
            id=uuid.uuid4(),
            company_id=ctx.company.id,
            application_id=app.id if app else None,
            info_request_id=request.id if request else None,
            document_type=doc_type,
            title=document_title(doc_type) if doc_type != "other" else safe_file_name(file_name),
            scope="application" if app and doc_scope == "application" else doc_scope,
            origin="upload",
            file_name=safe_file_name(file_name),
            content_type=CONTENT_TYPES[fmt],
            size_bytes=len(content),
            version=1,
            status="uploaded",
            uploaded_by=ctx.user.id,
            uploaded_at=now(),
        )
        doc.file_path = self.store(ctx.company.id, doc.id, 1, content)
        doc.analysis = stub_analysis(doc, request.document_types if request else None)
        self.session.add(doc)
        await self.session.flush()
        return self.view(doc, await People.load(self.session, ctx.company))

    async def from_lk(self, ctx: ClientContext, body: dict) -> dict:
        ctx.require("upload_documents", "Загружать документы могут сотрудники с правом загрузки")
        kind = body.get("kind")
        if kind not in FROM_LK_KINDS:
            raise validation("Неизвестный вид документа", {"kind": "bank_statement, tax_data или fin_turnover"})
        try:
            start = date.fromisoformat(body.get("period_from") or "")
            end = date.fromisoformat(body.get("period_to") or "")
        except ValueError as e:
            raise validation("Укажите период", {"period_from": "Дата в формате ГГГГ-ММ-ДД"}) from e
        if start > end:
            raise validation("Начало периода позже конца", {"period_from": "Проверьте период"})
        app, request = await self.resolve_links(ctx, None, body.get("info_request_id"))
        try:
            content = await self.external.statement(ctx.company.inn, kind, start.isoformat(), end.isoformat())
        except IntegrationUnavailable as e:
            raise validation("Альфа-Бизнес сейчас недоступен, загрузите файл вручную", {"kind": "Недоступно"}) from e
        doc_type = FROM_LK_KINDS[kind]
        doc = Document(
            id=uuid.uuid4(),
            company_id=ctx.company.id,
            application_id=app.id if app else None,
            info_request_id=request.id if request else None,
            document_type=doc_type,
            title=f"{document_title(doc_type)} за {start.strftime('%d.%m.%Y')} - {end.strftime('%d.%m.%Y')}",
            scope="application" if app else "company",
            origin="alfa_lk",
            file_name=f"{doc_type}_{start.isoformat()}_{end.isoformat()}.pdf",
            content_type="application/pdf",
            size_bytes=len(content),
            version=1,
            status="accepted",
            uploaded_by=ctx.user.id,
            uploaded_at=now(),
        )
        doc.file_path = self.store(ctx.company.id, doc.id, 1, content)
        self.session.add(doc)
        await self.session.flush()
        return self.view(doc, await People.load(self.session, ctx.company))

    async def new_version(self, ctx: ClientContext, doc_id: uuid.UUID, content: bytes, file_name: str | None) -> dict:
        ctx.require("upload_documents", "Загружать документы могут сотрудники с правом загрузки")
        doc = await self.get(ctx, doc_id)
        fmt = self.check_file(doc.document_type, content)
        doc.version += 1
        doc.file_path = self.store(ctx.company.id, doc.id, doc.version, content)
        doc.file_name = safe_file_name(file_name)
        doc.content_type = CONTENT_TYPES[fmt]
        doc.size_bytes = len(content)
        doc.uploaded_by = ctx.user.id
        doc.uploaded_at = now()
        doc.origin = "upload"
        doc.status = "uploaded"
        doc.status_reason = None
        doc.expires_at = None
        request = await self.session.get(InfoRequest, doc.info_request_id) if doc.info_request_id else None
        doc.analysis = stub_analysis(doc, request.document_types if request else None)
        return self.view(doc, await People.load(self.session, ctx.company))

    async def analyze(self, ctx: ClientContext, doc_id: uuid.UUID) -> dict:
        ctx.require("upload_documents", "Проверку запускают сотрудники с правом загрузки")
        doc = await self.get(ctx, doc_id)
        request = await self.session.get(InfoRequest, doc.info_request_id) if doc.info_request_id else None
        doc.analysis = stub_analysis(doc, request.document_types if request else None)
        return self.view(doc, await People.load(self.session, ctx.company))

    async def delete(self, ctx: ClientContext, doc_id: uuid.UUID) -> None:
        if not ctx.has("upload_documents") or ctx.member.role.value == "authorized_employee":
            raise forbidden(
                "Удалять документы могут собственник, директор или бухгалтер",
                ["owner", "director", "cfo_or_accountant", "financing_employee", "banking_employee"],
            )
        doc = await self.get(ctx, doc_id)
        if doc.file_path:
            Path(doc.file_path).unlink(missing_ok=True)
        await self.session.delete(doc)

    async def file(self, ctx: ClientContext, doc_id: str) -> tuple[bytes, str, str]:
        """Содержимое, content-type и имя файла. sign-{app}-{type}: документ на подпись генерируется."""
        match = re.fullmatch(r"sign-([0-9a-f-]{36})-(contract|surety|deal_approval)", doc_id)
        if match:
            app = await self.session.get(Application, uuid.UUID(match[1]))
            if app is None or app.company_id != ctx.company.id:
                raise not_found("Документ не найден")
            return contract_text(app, ctx.company, match[2]).encode(), "text/plain; charset=utf-8", f"{match[2]}.txt"
        try:
            doc = await self.get(ctx, uuid.UUID(doc_id))
        except ValueError as e:
            raise not_found("Документ не найден") from e
        if not doc.file_path or not Path(doc.file_path).exists():
            body = f"{doc.title}\n\nДемо-документ: файл не хранится в прототипе.".encode()
            return body, "text/plain; charset=utf-8", "document.txt"
        return Path(doc.file_path).read_bytes(), doc.content_type, doc.file_name


def contract_text(app: Application, company: Company, kind: str) -> str:
    amount = app.approved_amount or app.requested_amount
    term = app.approved_term_months or app.requested_term_months
    calc = payment_schedule(amount, term, float(app.rate_percent), today())
    title = SIGN_DOC_TITLES[kind].upper()
    lines = [
        f"{title} № {app.number}",
        "",
        "Демонстрационный документ прототипа. Не является офертой.",
        "",
        f"Заёмщик: {company.full_name}, ИНН {company.inn}",
        "Кредитор: АО «Альфа-Банк» (смоделировано)",
        "",
        f"Сумма кредита: {format_rub(amount)}",
        f"Срок: {term} мес.",
        f"Ставка: {float(app.rate_percent):g}% годовых (условная)",
        f"Ежемесячный платёж: {format_rub(calc['monthly_payment']['value'])}",
        f"Переплата за весь срок: {format_rub(calc['overpayment']['value'])}",
        "",
        "Поручитель отвечает перед кредитором за исполнение заёмщиком обязательств по кредитному договору."
        if kind == "surety"
        else "Заёмщик обязуется вернуть кредит и уплатить проценты по графику платежей.",
    ]
    return "\n".join(lines)
