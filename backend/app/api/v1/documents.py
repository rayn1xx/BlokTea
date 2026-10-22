"""Документы (К.12)."""

import uuid
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, File, Form, Response, UploadFile, status

from app.api.deps import ClientDep, CurrentUserDep, DocumentServiceDep, SessionDep
from app.schemas.contracts import DocumentRef, DocumentType, FromLkRequest, LegalForm, MissingDocuments
from app.services.documents import document_types

router = APIRouter(tags=["documents"])

# читаем не больше максимального размера типа + запас, остальное отсечёт проверка
MAX_READ = 31 * 1024 * 1024


@router.get("/document-types")
async def types(
    _: CurrentUserDep, legal_form: LegalForm | None = None, product_code: str | None = None
) -> list[DocumentType]:
    return document_types(legal_form, product_code)


@router.get("/documents")
async def documents(
    ctx: ClientDep,
    service: DocumentServiceDep,
    scope: Literal["company", "application"] | None = None,
    application_id: uuid.UUID | None = None,
    status: str | None = None,
) -> list[DocumentRef]:
    return await service.list(ctx, scope, application_id, status)


@router.get("/documents/missing")
async def missing(ctx: ClientDep, service: DocumentServiceDep) -> MissingDocuments:
    return await service.missing(ctx)


@router.post("/documents", status_code=status.HTTP_201_CREATED)
async def upload(
    ctx: ClientDep,
    service: DocumentServiceDep,
    session: SessionDep,
    file: Annotated[UploadFile, File()],
    scope: Annotated[str | None, Form()] = None,
    document_type: Annotated[str | None, Form()] = None,
    application_id: Annotated[str | None, Form()] = None,
    info_request_id: Annotated[str | None, Form()] = None,
) -> DocumentRef:
    content = await file.read(MAX_READ)
    result = await service.upload(
        ctx,
        content=content,
        file_name=file.filename,
        document_type=document_type,
        scope=scope,
        application_id=application_id,
        info_request_id=info_request_id,
    )
    await session.commit()
    return result


@router.post("/documents/from-lk", status_code=status.HTTP_201_CREATED)
async def from_lk(body: FromLkRequest, ctx: ClientDep, service: DocumentServiceDep, session: SessionDep) -> DocumentRef:
    result = await service.from_lk(ctx, body.model_dump())
    await session.commit()
    return result


@router.get("/documents/{doc_id}")
async def get_document(doc_id: uuid.UUID, ctx: ClientDep, service: DocumentServiceDep) -> DocumentRef:
    doc = await service.get(ctx, doc_id)
    return (await service.views(ctx.company, [doc]))[0]


@router.get("/documents/{doc_id}/file", response_class=Response)
async def document_file(doc_id: str, ctx: ClientDep, service: DocumentServiceDep) -> Response:
    content, content_type, file_name = await service.file(ctx, doc_id)
    return Response(
        content,
        media_type=content_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(file_name)}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/documents/{doc_id}/versions", status_code=status.HTTP_201_CREATED)
async def new_version(
    doc_id: uuid.UUID,
    ctx: ClientDep,
    service: DocumentServiceDep,
    session: SessionDep,
    file: Annotated[UploadFile, File()],
) -> DocumentRef:
    result = await service.new_version(ctx, doc_id, await file.read(MAX_READ), file.filename)
    await session.commit()
    return result


@router.post("/documents/{doc_id}/analyze")
async def analyze(doc_id: uuid.UUID, ctx: ClientDep, service: DocumentServiceDep, session: SessionDep) -> DocumentRef:
    result = await service.analyze(ctx, doc_id)
    await session.commit()
    return result


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: uuid.UUID, ctx: ClientDep, service: DocumentServiceDep, session: SessionDep) -> None:
    await service.delete(ctx, doc_id)
    await session.commit()
