from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from firebase_admin import auth as fb_auth

# Rutas que no requieren autenticación
PUBLIC_PATHS = {"/api/health", "/api/docs", "/openapi.json", "/api/portfolio/debug-costs"}
_PUBLIC_PREFIXES = ("/api/portfolio/debug-movements/",)


class FirebaseAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Preflight CORS — debe pasar sin auth para que CORSMiddleware responda
        if request.method == "OPTIONS":
            return await call_next(request)

        if request.url.path in PUBLIC_PATHS or any(request.url.path.startswith(p) for p in _PUBLIC_PREFIXES):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                {"detail": "Autenticación requerida"},
                status_code=401,
            )

        token = auth_header.removeprefix("Bearer ")
        try:
            decoded = fb_auth.verify_id_token(token, check_revoked=True)
        except fb_auth.RevokedIdTokenError:
            return JSONResponse(
                {"detail": "Sesión revocada. Iniciá sesión nuevamente."},
                status_code=401,
            )
        except Exception:
            return JSONResponse(
                {"detail": "Token inválido o expirado"},
                status_code=401,
            )

        request.state.uid   = decoded["uid"]
        request.state.email = decoded.get("email", "")
        return await call_next(request)
