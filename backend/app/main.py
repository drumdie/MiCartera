from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.firebase_admin_init import init_firebase
from app.middleware.auth import FirebaseAuthMiddleware
from app.routers import portfolio, prices, stress, fundamentals

init_firebase()

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

app.add_middleware(FirebaseAuthMiddleware)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


app.include_router(portfolio.router)
app.include_router(prices.router)
app.include_router(stress.router)
app.include_router(fundamentals.router)
