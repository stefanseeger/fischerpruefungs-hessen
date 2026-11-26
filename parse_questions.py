"""Parse official Hessen fishing exam PDF into structured JSON."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT_DIR = Path(__file__).resolve().parent
PDF_PATH = ROOT_DIR / "fischerpruefungsfragen_und-antworten_hessen_mit_loesungen.pdf"
OUT_PATH = ROOT_DIR / "hessen_pruefungsfragen.json"

HEADER_PREFIXES = (
    "Fragenkatalog der Fischereischeinprüfung",
    "und landesspezifische Fragen des Landes Hessen",
)

CATEGORY_RE = re.compile(r"^\d+\.\s+.+")
QUESTION_RE = re.compile(r"^(\d+)\.\s+(.+)$")
OPTION_RE = re.compile(r"^([a-d])\)\s*(.*)$")


def extract_lines(doc: pymupdf.Document) -> list[tuple[int, str, bool]]:
    """Return (page_num, text, is_bold) for every non-empty line in the PDF."""
    result: list[tuple[int, str, bool]] = []
    for page_idx, page in enumerate(doc, start=1):
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                text = "".join(s["text"] for s in spans).strip()
                if not text:
                    continue
                if any(text.startswith(p) for p in HEADER_PREFIXES):
                    continue
                non_ws_spans = [s for s in spans if s["text"].strip()]
                total_chars = sum(len(s["text"].strip()) for s in non_ws_spans)
                bold_chars = sum(
                    len(s["text"].strip())
                    for s in non_ws_spans
                    if ("Bold" in s["font"] or (s["flags"] & 16))
                )
                is_bold = total_chars > 0 and (bold_chars > total_chars / 2)
                result.append((page_idx, text, is_bold))
    return result


def parse_questions(lines: list[tuple[int, str, bool]]) -> list[dict]:
    """Parse extracted PDF lines into structured question dicts."""
    questions: list[dict] = []
    current_category = ""
    current_q: dict | None = None
    current_opt: str | None = None

    def flush_question() -> None:
        nonlocal current_q, current_opt
        if current_q is not None:
            questions.append(current_q)
            current_q = None
            current_opt = None

    for page_num, text, is_bold in lines:
        if is_bold and CATEGORY_RE.match(text) and not OPTION_RE.match(text):
            flush_question()
            current_category = text
            continue

        opt_match = OPTION_RE.match(text)
        if opt_match and current_q is not None:
            opt_key, opt_rest = opt_match.group(1), opt_match.group(2).strip()
            current_opt = opt_key
            current_q["antwortmoeglichkeiten"][opt_key] = opt_rest
            if is_bold:
                current_q["_bold_opts"].add(opt_key)
            continue

        q_match = QUESTION_RE.match(text)
        if q_match and not is_bold:
            flush_question()
            current_q = {
                "kategorie": current_category,
                "nummer": int(q_match.group(1)),
                "frage": q_match.group(2).strip(),
                "antwortmoeglichkeiten": {},
                "richtige_antwort": None,
                "richtige_antwort_text": None,
                "_bold_opts": set(),
                "_page": page_num,
            }
            continue

        # Continuation line for either current option or current question
        if current_q is not None:
            if current_opt is not None:
                prev = current_q["antwortmoeglichkeiten"][current_opt]
                current_q["antwortmoeglichkeiten"][current_opt] = f"{prev} {text}".strip()
                if is_bold:
                    current_q["_bold_opts"].add(current_opt)
            else:
                current_q["frage"] = f"{current_q['frage']} {text}".strip()

    flush_question()

    cleaned: list[dict] = []
    issues: list[str] = []
    for q in questions:
        bold_opts = sorted(q.pop("_bold_opts"))
        page_num = q.pop("_page")
        if len(bold_opts) != 1:
            issues.append(
                f"Page {page_num} ({q['kategorie']} #{q['nummer']}): expected 1 bold option, found {bold_opts}"
            )
        if bold_opts:
            ans_key = bold_opts[0]
            q["richtige_antwort"] = ans_key
            q["richtige_antwort_text"] = q["antwortmoeglichkeiten"].get(ans_key)
        if len(q["antwortmoeglichkeiten"]) < 2:
            issues.append(
                f"Page {page_num} ({q['kategorie']} #{q['nummer']}): only {len(q['antwortmoeglichkeiten'])} options"
            )
        cleaned.append(q)

    if issues:
        print(f"WARNINGS ({len(issues)}):", file=sys.stderr)
        for issue in issues[:20]:
            print(f"  - {issue}", file=sys.stderr)

    return cleaned


def main() -> int:
    doc = pymupdf.open(PDF_PATH)
    lines = extract_lines(doc)
    questions = parse_questions(lines)
    OUT_PATH.write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")

    by_cat: dict[str, int] = {}
    for q in questions:
        by_cat[q["kategorie"]] = by_cat.get(q["kategorie"], 0) + 1

    print(f"Saved {len(questions)} questions to {OUT_PATH}")
    for cat, count in by_cat.items():
        print(f"  - {cat}: {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
