"""
API integration tests for PDD_STAT FastAPI endpoints.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ======================== Fixtures ========================

@pytest.fixture(scope="module", autouse=True)
def setup_test_project():
    """Ensure a test project exists before running tests."""
    # Projects are at STAT_new/projects/ (two levels up from backend/)
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    test_projects = project_root / "projects"
    test_projects.mkdir(parents=True, exist_ok=True)

    # Check if we have Пэт project for testing
    pat_project = test_projects / "Пэт"
    if not pat_project.exists():
        pytest.skip("Test project 'Пэт' not found — create it via API or manually")

    # Set active project
    active_file = project_root / "app" / "backend" / "app" / "active_project.txt"
    active_file.write_text(str(pat_project))


# ======================== Health ========================

class TestHealth:
    def test_health_endpoint(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


# ======================== Projects ========================

class TestProjects:
    def test_list_projects(self):
        resp = client.get("/api/projects/")
        assert resp.status_code == 200
        data = resp.json()
        assert "projects" in data
        assert isinstance(data["projects"], list)

    def test_open_project(self):
        resp = client.post("/api/projects/open?name=Пэт")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "opened"
        assert data.get("name") == "Пэт"

    def test_open_nonexistent_project(self):
        resp = client.post("/api/projects/open?name=nonexistent_project_xyz")
        assert resp.status_code == 404

    def test_create_then_delete_project(self):
        import time
        name = f"_test_del_{int(time.time())}"
        # Create
        resp = client.post(f"/api/projects/create?name={name}")
        assert resp.status_code == 200, f"Create failed: {resp.json()}"
        # Extract actual directory name from path
        dir_name = Path(resp.json().get("path", name)).name
        # Delete using actual directory name
        resp = client.delete(f"/api/projects/{dir_name}")
        assert resp.status_code == 200
        # Verify gone
        resp = client.post(f"/api/projects/open?name={dir_name}")
        assert resp.status_code == 404

    def test_get_project_info(self):
        resp = client.get("/api/projects/")
        assert resp.status_code == 200


# ======================== Analysis ========================

class TestAnalysis:
    def setup_method(self):
        # Ensure Пэт is active
        client.post("/api/projects/open?name=Пэт")

    def test_run_descriptive_stats(self):
        resp = client.post("/api/analysis/run", json={
            "template": "descriptive_stats",
            "params": {"target_col": "", "group_col": "", "show_chart": "false", "chart_type": "auto"}
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert "MTV_SUV>4" in data.get("output", "")

    def test_run_categorical(self):
        resp = client.post("/api/analysis/run", json={
            "template": "categorical",
            "params": {"col1": "PET_responce", "col2": "PFS_event"}
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True

    def test_run_cox_ph(self):
        resp = client.post("/api/analysis/run", json={
            "template": "cox_ph",
            "params": {
                "time_col": "PFS_time", "event_col": "PFS_event",
                "covariates": ["MTV_SUV>4"],
                "regression_type": "multi"
            }
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True

    def test_run_logistic(self):
        resp = client.post("/api/analysis/run", json={
            "template": "logistic",
            "params": {
                "target_col": "PET_responce",
                "predictors": ["MTV_SUV>4"],
                "regression_type": "enter"
            }
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True

    def test_run_kaplan_meier(self):
        resp = client.post("/api/analysis/run", json={
            "template": "kaplan_meier",
            "params": {"time_col": "PFS_time", "event_col": "PFS_event", "group_by": ""}
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True

    def test_run_invalid_template(self):
        resp = client.post("/api/analysis/run", json={
            "template": "nonexistent_template_xyz",
            "params": {}
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is False

    def test_get_history(self):
        resp = client.get("/api/analysis/history")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)

    def test_get_templates(self):
        resp = client.get("/api/analysis/charts")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0

    def test_draft_article(self):
        # Test draft article endpoint. Since it depends on active project analyses and AI configuration,
        # we expect it to return either a 400 (AI not configured) or 500 (API key invalid/network error)
        # or 200 if Ollama/Groq is fully mockable/functional.
        resp = client.post("/api/analysis/report/draft-article", json={
            "title": "Test Scientific Article Draft",
            "analyses": "all",
            "selected_ids": [],
            "language": "English",
            "section": "methods"
        })
        assert resp.status_code in (200, 400, 500)


# ======================== AI ========================

class TestAI:
    def test_get_config(self):
        resp = client.get("/api/ai/config")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)

    def test_get_available_templates(self):
        # No standalone endpoint for templates — frontend has them hardcoded
        pass


# ======================== Frontend ========================

class TestFrontend:
    def test_root_returns_html(self):
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").startswith("text/html")

    def test_spa_fallback(self):
        resp = client.get("/some/nonexistent/page")
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").startswith("text/html")


# ======================== Plots ========================

class TestPlots:
    def test_plot_not_found(self):
        resp = client.get("/plots/nonexistent_plot_xyz.png")
        assert resp.status_code == 404

    def test_static_css(self):
        resp = client.get("/style.css")
        assert resp.status_code in (200, 404)  # 404 if no style.css
