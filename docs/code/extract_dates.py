import argparse
import csv
import datetime as dt
import io
import os
import random
import re
import sys
import time

MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
DATE = rf"({MONTHS})\s+\d{{1,2}},?\s+\d{{4}}"
VARIANTS = [
    rf"in\s+response\s+to\s+[^.]{{0,100}}?application\s+dated\s+({DATE})",
    rf"in\s+response\s+to\s+your\s+application\s+of\s+({DATE})",
    rf"by\s+application\s+dated\s+({DATE})",
    rf"pursuant\s+to\s+your\s+application\s+dated\s+({DATE})",
    rf"your\s+application\s+dated\s+({DATE})",
    rf"application\s+for\s+amendment\s+dated\s+({DATE})",
    rf"license\s+amendment\s+request(?:\s*\(LAR\))?\s+dated\s+({DATE})",
    rf"letter\s+dated\s+({DATE})\s*,?\s+as\s+supplemented",
]
KNOWN_GOOD = {
    "ML010400337": "1977-03-24",
    "ML14133A046": "2012-09-28",
    "ML17032A120": "2015-09-21",
    "ML032691360": "2002-12-19",
}
ACCESSION = re.compile(rb"ML\d{5}[A-Z]\d{3}|ML\d{9}")
DAYS_PER_MONTH = 30.44


def parse_application_date(text):
    flat = re.sub(r"\s+", " ", text)
    for number, pattern in enumerate(VARIANTS, 1):
        m = re.search(pattern, flat, flags=re.IGNORECASE)
        if not m:
            continue
        raw = re.sub(r"(\d{1,2})\s+(\d{4})$", r"\1, \2", m.group(1))
        for fmt in ("%B %d, %Y", "%B %d %Y"):
            try:
                return dt.datetime.strptime(raw, fmt).date().isoformat(), number
            except ValueError:
                continue
    return None, None


def pdf_url(accession):
    return f"https://www.nrc.gov/docs/{accession[:6]}/{accession}.pdf"


def alt_url(accession):
    return f"https://adamswebsearch2.nrc.gov/webSearch2/view?AccessionNumber={accession}"


def pdf_text(content, first_pages=10, max_pages=40):
    import pdfplumber
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            text = "\n".join((p.extract_text() or "") for p in pdf.pages[:first_pages])
            if parse_application_date(text)[0] is None:
                text += "\n" + "\n".join((p.extract_text() or "") for p in pdf.pages[first_pages:max_pages])
    except Exception as e:
        return None, f"pdf-error:{type(e).__name__}"
    return (text, "ok") if text.strip() else (None, "no-text-layer")


class Fetcher:
    def __init__(self, sleep):
        self.sleep = sleep
        try:
            from curl_cffi import requests as client
            self.session = client.Session(impersonate="chrome")
            self.kind = "curl_cffi"
        except ImportError:
            import requests as client
            self.session = client.Session()
            self.session.headers.update({"Accept": "application/pdf,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9"})
            self.kind = "requests"

    def get(self, url):
        try:
            r = self.session.get(url, timeout=90)
        except Exception as e:
            return None, f"error:{type(e).__name__}"
        if r.status_code != 200:
            return None, f"http:{r.status_code}"
        return r.content, "ok"

    def pdf(self, accession):
        content, status = self.get(pdf_url(accession))
        if content is not None and content[:5] == b"%PDF-":
            return content, "ok"
        if content is not None:
            return content, "not-pdf"
        if status == "http:403":
            content, status = self.get(alt_url(accession))
            if content is not None and content[:5] == b"%PDF-":
                return content, "ok"
            time.sleep(45)
            content, status = self.get(pdf_url(accession))
            if content is not None and content[:5] == b"%PDF-":
                return content, "ok"
        return None, status

    def pause(self):
        time.sleep(self.sleep + random.random() * 2)


def read_letter(accession, fetcher, pdf_dir=None, max_children=6):
    if pdf_dir:
        path = os.path.join(pdf_dir, f"{accession}.pdf")
        if not os.path.exists(path):
            return None, "no-local-file", accession
        with open(path, "rb") as f:
            text, status = pdf_text(f.read())
        return text, status, accession
    content, status = fetcher.pdf(accession)
    if status == "ok":
        text, status = pdf_text(content)
        return text, status, accession
    if status != "not-pdf":
        return None, status, accession
    children = []
    for m in ACCESSION.finditer(content):
        child = m.group().decode()
        if child != accession and child not in children:
            children.append(child)
    for child in children[:max_children]:
        fetcher.pause()
        sub, sub_status = fetcher.pdf(child)
        if sub_status != "ok":
            continue
        text, text_status = pdf_text(sub)
        if text and parse_application_date(text)[0]:
            return text, "ok", child
    return None, f"package-unresolved({len(children)})" if children else "not-pdf", accession


def pilot_rows(rows, size=10, seed=42):
    rng = random.Random(seed)
    chosen = [r for r in rows if r["nrc_table_accession"] in KNOWN_GOOD]
    year = lambda r: int(r["approval_date"][:4])
    for test, n in ((lambda r: r["uprate_type"] == "Stretch" and year(r) < 1990, 2),
                    (lambda r: r["uprate_type"] == "MUR" and year(r) >= 2000, 3),
                    (lambda r: r["uprate_type"] == "EPU" and year(r) >= 2005, 2)):
        pool = [r for r in rows if test(r) and r not in chosen]
        chosen += rng.sample(pool, min(n, len(pool)))
    while len(chosen) < size:
        chosen.append(rng.choice([r for r in rows if r not in chosen]))
    return chosen[:size]


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(here, "data", "uprate_approvals_v1.0.csv"))
    ap.add_argument("--out", default=os.path.join(here, "results"))
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--pdf-dir", default=None)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--sleep", type=float, default=4.0)
    args = ap.parse_args()

    with open(args.data, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    modern = [r for r in rows if r["nrc_table_accession"].startswith("ML")]
    print(f"{len(rows)} approvals, {len(modern)} with ADAMS accessions, {len(rows) - len(modern)} microfiche era rows skipped")
    todo = modern if args.full else pilot_rows(modern)
    if args.limit:
        todo = todo[:args.limit]

    fetcher = None
    if not args.pdf_dir:
        try:
            import pdfplumber
            fetcher = Fetcher(args.sleep)
        except ImportError:
            sys.exit("pip install -r requirements.txt")
        print(f"fetching with {fetcher.kind}, {len(todo)} letters")

    cache, results = {}, []
    for i, r in enumerate(todo, 1):
        accession = r["nrc_table_accession"]
        if accession not in cache:
            cache[accession] = read_letter(accession, fetcher, args.pdf_dir)
            if fetcher:
                fetcher.pause()
        text, status, letter = cache[accession]
        applied, variant = parse_application_date(text) if text else (None, None)
        months = ""
        if applied:
            days = (dt.date.fromisoformat(r["approval_date"]) - dt.date.fromisoformat(applied)).days
            months = round(days / DAYS_PER_MONTH, 1)
            if KNOWN_GOOD.get(accession, applied) != applied:
                sys.exit(f"stop: {r['plant']} read as {applied}, known good date is {KNOWN_GOOD[accession]}")
        dataset = r["application_date"]
        check = "not found" if not applied else ("agrees" if applied == dataset else ("new" if not dataset else "differs"))
        print(f"[{i}/{len(todo)}] {r['plant']:<24} {r['uprate_type']:<7} {applied or status:<16} {months!s:>5}  variant {variant or '-'}  {check}")
        results.append(dict(event_no=r["event_no"], plant=r["plant"], uprate_type=r["uprate_type"], approval_date=r["approval_date"],
                            nrc_table_accession=accession, letter_accession=letter, application_date=applied or "",
                            review_months=months, parser_variant=variant or "", status=status if not applied else "ok",
                            dataset_application_date=dataset, dataset_source=r["date_source"], check=check))

    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, "extracted_dates.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        w.writeheader()
        w.writerows(results)
    found = sum(1 for x in results if x["application_date"])
    agree = sum(1 for x in results if x["check"] == "agrees")
    differ = [x for x in results if x["check"] == "differs"]
    print(f"\nread {found} of {len(results)} letters; {agree} agree with the dataset, {len(differ)} differ -> {path}")
    for x in differ:
        print(f"  differs: {x['plant']} event {x['event_no']}: parser {x['application_date']}, dataset {x['dataset_application_date']}")
    if not args.full:
        verdict = "pass: run --full" if found >= 8 else "fail: fix the patterns before a full run"
        print(f"pilot rule (8 of 10): {verdict}")


if __name__ == "__main__":
    main()
