from fastapi import APIRouter

from app.api.v1 import applications, auth, health, home

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(home.router)
api_router.include_router(applications.router)
