from fastapi import APIRouter

from app.api.v1 import applications, auth, bank, company, documents, feed, health, home, products, tasks

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(home.router)
api_router.include_router(company.router)
api_router.include_router(tasks.router)
api_router.include_router(products.router)
api_router.include_router(applications.router)
api_router.include_router(documents.router)
api_router.include_router(feed.router)
api_router.include_router(bank.router)
