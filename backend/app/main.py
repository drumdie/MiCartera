from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(
    title="MiCartera API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


# Los routers de portfolio, prices y stress se registran en Fase 2:
# from app.routers import portfolio, prices, stress
# app.include_router(portfolio.router, prefix="/api")
# app.include_router(prices.router,    prefix="/api")
# app.include_router(stress.router,    prefix="/api")
