"""
API key authentication middleware for PDD_STAT.
"""

import os

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Проверяет API key из заголовка X-API-Key или query-параметра api_key."""

    def __init__(self, app):
        super().__init__(app)
        self.api_key = os.environ.get("PDD_STAT_API_KEY", "")
        self.public_paths = {
            "/api/health",
            "/api/ai/config",
            "/",
            "/index.html",
            "/style.css",
        }

    async def dispatch(self, request: Request, call_next):
        # Skip auth if no key configured
        if not self.api_key:
            return await call_next(request)

        # Allow public paths (health check, frontend, config)
        if request.url.path in self.public_paths:
            return await call_next(request)

        # Allow static files
        if request.url.path.startswith("/js/") or request.url.path.startswith("/plots/"):
            return await call_next(request)

        # Check API key
        key = request.headers.get("X-API-Key", "")
        if not key:
            key = request.query_params.get("api_key", "")
        if key != self.api_key:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid API key. Set X-API-Key header."}
            )

        return await call_next(request)
