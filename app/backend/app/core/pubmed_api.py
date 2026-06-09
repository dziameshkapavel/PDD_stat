"""
PubMed API client — NCBI E-utilities wrapper.
Search, fetch details, parse XML, rate limiting.
"""

import time
import xml.etree.ElementTree as ET
from datetime import datetime

import httpx


class PubMedAPI:
    """PubMed API клиент для поиска и загрузки статей."""

    BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"

    def __init__(self, api_key: str = "", email: str = "app@pdd-stat.local"):
        self.api_key = api_key
        self.email = email

    def search(self, query: str, max_results: int = 50, years: int = 5) -> list[str]:
        """Поиск PMIDs по запросу с фильтром по дате."""
        current_year = datetime.now().year
        mindate = current_year - years

        params = {
            "db": "pubmed",
            "term": query,
            "retmax": max_results,
            "retmode": "json",
            "mindate": mindate,
            "maxdate": current_year,
            "datetype": "pdat",
            "email": self.email,
        }
        if self.api_key:
            params["api_key"] = self.api_key

        try:
            response = httpx.get(
                self.BASE_URL + "esearch.fcgi",
                params=params,
                timeout=30,
            )
            if response.status_code != 200:
                return []

            data = response.json()
            return data.get("esearchresult", {}).get("idlist", [])
        except Exception:
            return []

    def fetch_details(self, pmids: list[str]) -> list[dict]:
        """Загрузка деталей статей (title, abstract, authors, metadata)."""
        if not pmids:
            return []

        all_articles: list[dict] = []
        total = len(pmids)

        for i in range(0, total, 50):
            chunk = pmids[i : i + 50]

            params = {
                "db": "pubmed",
                "id": ",".join(chunk),
                "retmode": "xml",
                "email": self.email,
            }
            if self.api_key:
                params["api_key"] = self.api_key

            try:
                response = httpx.get(
                    self.BASE_URL + "efetch.fcgi",
                    params=params,
                    timeout=60,
                )
                if response.status_code == 200:
                    articles = self._parse_xml(response.text)
                    all_articles.extend(articles)
                time.sleep(0.35)
            except Exception:
                continue

        return all_articles

    def _parse_xml(self, xml_text: str) -> list[dict]:
        """Парсинг PubMed XML в структурированные статьи."""
        articles: list[dict] = []

        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return []

        for article in root.findall(".//PubmedArticle"):
            data: dict = {}

            pmid_el = article.find(".//PMID")
            data["pmid"] = pmid_el.text if pmid_el is not None else ""

            title_el = article.find(".//ArticleTitle")
            data["title"] = "".join(title_el.itertext()) if title_el is not None else "No title"

            abstract_parts: list[str] = []
            for abs_text in article.findall(".//AbstractText"):
                label = abs_text.get("Label", "")
                text = "".join(abs_text.itertext()).strip()
                if label and text:
                    abstract_parts.append(f"{label}: {text}")
                elif text:
                    abstract_parts.append(text)
            data["abstract"] = " ".join(abstract_parts)

            authors: list[str] = []
            for author in article.findall(".//Author"):
                last = author.find("LastName")
                fore = author.find("ForeName")
                if last is not None and fore is not None:
                    authors.append(f"{fore.text} {last.text}")
                elif last is not None:
                    authors.append(last.text)
            data["authors"] = authors
            if len(authors) > 3:
                data["authors_str"] = ", ".join(authors[:3]) + " et al."
            else:
                data["authors_str"] = ", ".join(authors)

            journal_el = article.find(".//Journal/Title")
            data["journal"] = journal_el.text if journal_el is not None else ""

            year_el = article.find(".//PubDate/Year")
            data["year"] = year_el.text if year_el is not None else ""
            if not data["year"]:
                medline_date = article.find(".//PubDate/MedlineDate")
                if medline_date is not None and medline_date.text:
                    data["year"] = medline_date.text[:4]

            doi_el = article.find(".//ELocationID[@EIdType='doi']")
            data["doi"] = doi_el.text if doi_el is not None else ""

            data["url"] = f"https://pubmed.ncbi.nlm.nih.gov/{data['pmid']}/"

            articles.append(data)

        return articles


def format_article_for_context(article: dict) -> str:
    """Форматирует статью для вставки в контекст AI."""
    parts = [
        f"PMID: {article.get('pmid', '')}",
        f"Title: {article.get('title', '')}",
    ]
    authors = article.get("authors_str", "")
    if authors:
        parts.append(f"Authors: {authors}")
    journal = article.get("journal", "")
    year = article.get("year", "")
    if journal or year:
        parts.append(f"Journal: {journal} ({year})")
    abstract = article.get("abstract", "")
    if abstract:
        parts.append(f"Abstract: {abstract}")
    return "\n".join(parts)


def format_articles_for_context(articles: list[dict], max_chars: int = 6000) -> str:
    """Форматирует список статей для вставки в контекст AI."""
    lines = ["## PubMed Articles", f"Source: PubMed search ({len(articles)} articles)", ""]
    for art in articles:
        block = format_article_for_context(art)
        if len("\n".join(lines)) + len(block) > max_chars:
            remaining = len(articles) - articles.index(art)
            lines.append(f"... and {remaining} more articles")
            break
        lines.append(block)
        lines.append("---")
    return "\n".join(lines)
