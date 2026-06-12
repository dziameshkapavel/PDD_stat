import logging
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app.core.auth import APIKeyMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-5s | %(name)s | %(message)s",
    handlers=[
        logging.FileHandler(f"pdd_stat_{datetime.now().strftime('%Y%m%d')}.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("pdd_stat")

app = FastAPI(title="PDD_STAT API", version="1.0.0")

# Auth middleware (must be first)
app.add_middleware(APIKeyMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = datetime.now()
    response = await call_next(request)
    dt = (datetime.now() - t0).total_seconds()
    logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({dt:.2f}s)")
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"500 on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal server error"}
    )

# Путь к фронтенду (на уровень выше backend/)
frontend_path = Path(__file__).parent.parent.parent / "frontend"

# Монтируем статические директории
js_path = frontend_path / "js"
if js_path.exists():
    app.mount("/js", StaticFiles(directory=str(js_path)), name="js")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.get("/plots/{filename}")
async def serve_plot(filename: str):
    """Отдаёт график из папки plots активного проекта"""
    plots_txt = Path(__file__).parent / "active_project.txt"
    if plots_txt.exists():
        active = plots_txt.read_text().strip()
        if active:
            filepath = Path(active) / "plots" / filename
            if filepath.exists():
                return FileResponse(filepath, media_type="image/png")
    return Response("Not found", status_code=404)


# Static files
@app.get("/style.css")
async def serve_css():
    css_path = frontend_path / "style.css"
    if css_path.exists():
        return FileResponse(css_path, media_type="text/css")
    return Response("Not found", status_code=404)


# Импорт роутеров
from app.api import ai, analysis, projects

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])


@app.get("/")
async def root():
    index_path = frontend_path / "index.html"
    if index_path.exists():
        return FileResponse(index_path, media_type="text/html")
    return HTMLResponse(content="Index not found", status_code=404)


@app.get("/{path:path}")
async def serve_frontend(path: str, request: Request):
    # Пропускаем API и статику
    if path.startswith("api") or path.startswith("js") or path.startswith("plots"):
        return JSONResponse(content={"detail": "Not Found"}, status_code=404)

    # Проверяем файл
    file_path = (frontend_path / path).resolve()
    if not str(file_path).startswith(str(frontend_path.resolve())):
        return JSONResponse(content={"detail": "Not Found"}, status_code=404)
    if file_path.exists() and file_path.is_file():
        # Определяем MIME тип
        ext = file_path.suffix.lower()
        mime_types = {
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.html': 'text/html',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml'
        }
        media_type = mime_types.get(ext, 'application/octet-stream')
        return FileResponse(file_path, media_type=media_type)

    # Для SPA - возвращаем index.html
    index_path = frontend_path / "index.html"
    if index_path.exists():
        return FileResponse(index_path, media_type="text/html")

    return HTMLResponse(content="Not found", status_code=404)
