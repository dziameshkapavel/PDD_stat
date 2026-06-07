"""Нагрузочное тестирование PDD_STAT API.

Использование:
    python3 load_test.py                # 10 concurrent, 50 total
    python3 load_test.py --conc 20 --requests 100
    python3 load_test.py --endpoint health  # только health
"""

from __future__ import annotations
import asyncio
import json
import time
import sys
import statistics
import argparse
from dataclasses import dataclass, field
from typing import List
from math import ceil

try:
    import aiohttp
except ImportError:
    print("Установи aiohttp: pip install aiohttp")
    sys.exit(1)

BASE = "http://127.0.0.1:8000"

ENDPOINTS = {
    "health": ("GET", "/api/health", None),
    "projects": ("GET", "/api/projects/", None),
    "schema": ("GET", "/api/projects/Пэт/schema", None),
    "history": ("GET", "/api/projects/Пэт/analysis/history", None),
    "analysis_descriptive": (
        "POST", "/api/analysis/run",
        {"template": "descriptive_stats", "params": {"columns": ["age", "LDH", "ECOG"]}},
    ),
    "analysis_cross_tab": (
        "POST", "/api/analysis/run",
        {"template": "categorical", "params": {"row_col": "ECOG", "col_col": "stage"}},
    ),
    "analysis_cox": (
        "POST", "/api/analysis/run",
        {"template": "cox_ph", "params": {
            "time_col": "age", "event_col": "LDH",
            "covariates": ["ECOG", "stage", "IPI"]
        }},
    ),
}


@dataclass
class Result:
    endpoint: str
    status: int
    elapsed: float
    error: str = ""


async def request(session: aiohttp.ClientSession, method: str, path: str,
                  body: dict | None, timeout: float = 30) -> Result:
    t0 = time.monotonic()
    try:
        if method == "GET":
            async with session.get(f"{BASE}{path}", timeout=aiohttp.ClientTimeout(total=timeout)) as r:
                await r.read()
                return Result(endpoint=path, status=r.status, elapsed=time.monotonic() - t0)
        else:
            async with session.post(f"{BASE}{path}", json=body,
                                    timeout=aiohttp.ClientTimeout(total=timeout)) as r:
                await r.read()
                return Result(endpoint=path, status=r.status, elapsed=time.monotonic() - t0)
    except Exception as e:
        return Result(endpoint=path, status=0, elapsed=time.monotonic() - t0, error=str(e))


async def worker(session: aiohttp.ClientSession, endpoint_name: str,
                 queue: asyncio.Queue, results: List[Result]):
    method, path, body = ENDPOINTS[endpoint_name]
    while True:
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            return
        r = await request(session, method, path, body)
        r.endpoint = endpoint_name  # store logical name, not path
        results.append(r)


async def run_load(endpoint_names: List[str], concurrent: int, total: int):
    print(f"\n{'='*60}")
    print(f"  Нагрузочное тестирование PDD_STAT API")
    print(f"  Эндпоинты: {', '.join(endpoint_names)}")
    print(f"  Concurrency: {concurrent}, Requests: {total}")
    print(f"{'='*60}\n")

    connector = aiohttp.TCPConnector(limit=concurrent, limit_per_host=concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        results: List[Result] = []
        per_endpoint = {e: [] for e in endpoint_names}
        queue: asyncio.Queue = asyncio.Queue()
        for _ in range(total):
            queue.put_nowait(None)

        workers = []
        # round-robin endpoints for each worker
        for i in range(concurrent):
            ep = endpoint_names[i % len(endpoint_names)]
            workers.append(worker(session, ep, queue, results))

        t0 = time.monotonic()
        await asyncio.gather(*workers)
        total_time = time.monotonic() - t0

        for r in results:
            per_endpoint[r.endpoint].append(r)

        # Общая статистика
        latencies = sorted(r.elapsed for r in results)
        success = sum(1 for r in results if 200 <= r.status < 500)
        errors = sum(1 for r in results if r.status == 0 or r.status >= 500)

        print(f"  {'─'*50}")
        print(f"  Всего: {len(results)} запросов за {total_time:.2f}s")
        print(f"  Throughput: {len(results)/total_time:.1f} req/s")
        if latencies:
            print(f"  P50: {latencies[len(latencies)//2]*1000:.1f}ms")
            print(f"  P95: {latencies[int(len(latencies)*0.95)]*1000:.1f}ms")
            print(f"  P99: {latencies[int(len(latencies)*0.99)]*1000:.1f}ms")
            print(f"  Min: {latencies[0]*1000:.1f}ms  Max: {latencies[-1]*1000:.1f}ms")
        print(f"  Успешно: {success}, Ошибки: {errors}")
        if errors:
            print(f"  Детали ошибок:")
            for r in results:
                if r.status == 0 or r.status >= 500:
                    print(f"    {r.endpoint} status={r.status} err={r.error}")
        print()

        # По эндпоинтам
        for ep in endpoint_names:
            rs = per_endpoint[ep]
            if not rs:
                continue
            lats = sorted(r.elapsed for r in rs)
            ok = sum(1 for r in rs if 200 <= r.status < 500)
            fail = sum(1 for r in rs if r.status == 0 or r.status >= 500)
            print(f"  [{ep}] {len(rs)} запросов, {ok} OK, {fail} ошибок")
            print(f"    P50={lats[len(lats)//2]*1000:.1f}ms  P95={lats[int(len(lats)*0.95)]*1000:.1f}ms  P99={lats[int(len(lats)*0.99)]*1000:.1f}ms")
            print(f"    Min={lats[0]*1000:.1f}ms  Max={lats[-1]*1000:.1f}ms")

        print(f"\n  {'='*50}")
        if errors > 0:
            print(f"  ⚠️  {errors}/{len(results)} ошибок. Рекомендуется проверить логи сервера.")
        elif success == len(results):
            print(f"  ✅ Все запросы выполнены успешно")
        print(f"  {'='*50}\n")

        return results


async def main():
    parser = argparse.ArgumentParser(description="Load test PDD_STAT API")
    parser.add_argument("--conc", type=int, default=10, help="Concurrent requests (default: 10)")
    parser.add_argument("--requests", type=int, default=50, help="Total requests (default: 50)")
    parser.add_argument("--endpoint", type=str, default=None,
                        help="Specific endpoint (default: all)")
    args = parser.parse_args()

    if args.endpoint:
        if args.endpoint not in ENDPOINTS:
            print(f"Неизвестный endpoint: {args.endpoint}")
            print(f"Доступны: {', '.join(ENDPOINTS.keys())}")
            return
        eps = [args.endpoint]
    else:
        eps = list(ENDPOINTS.keys())

    await run_load(eps, args.conc, args.requests)


if __name__ == "__main__":
    asyncio.run(main())
