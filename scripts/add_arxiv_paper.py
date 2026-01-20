#!/usr/bin/env python3
"""Add an arXiv paper to the bibliography and a YAML catalog.

Usage example:
  python3 scripts/add_arxiv_paper.py \
    --id wijnands2025_lam_sgm_comparison \
    --category forecasting \
    https://arxiv.org/abs/2507.18378
"""

import argparse
import os
import re
import subprocess
import sys
import textwrap
from urllib.request import urlretrieve

ARXIV_ABS_RE = re.compile(r"arxiv\.org/abs/([\w.\-]+)")
ARXIV_PDF_RE = re.compile(r"arxiv\.org/pdf/([\w.\-]+)\.pdf")

CATEGORY_FILES = {
    "forecasting": os.path.join("database", "km_forecasting_models.yaml"),
    "downscaling": os.path.join("database", "km_downscaling_and_generative.yaml"),
    "global": os.path.join("database", "global_drivers_priors.yaml"),
}


def normalize_arxiv_id(url_or_id):
    match = ARXIV_ABS_RE.search(url_or_id) or ARXIV_PDF_RE.search(url_or_id)
    if match:
        return match.group(1)
    return url_or_id.strip().replace(".pdf", "")


def arxiv_pdf_url(arxiv_id):
    return f"https://arxiv.org/pdf/{arxiv_id}.pdf"


def arxiv_abs_url(arxiv_id):
    return f"https://arxiv.org/abs/{arxiv_id}"


def run_pdftotext(pdf_path):
    try:
        result = subprocess.run(
            ["pdftotext", pdf_path, "-"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        raise RuntimeError("pdftotext is required but was not found in PATH.")
    return result.stdout


def extract_basic_metadata(text):
    lines = [line.rstrip() for line in text.splitlines()]

    arxiv_line = ""
    header_lines = []
    for line in lines[:80]:
        stripped = line.strip()
        if stripped.lower().startswith("abstract"):
            break
        header_lines.append(line)
        if stripped.startswith("arXiv:"):
            arxiv_line = stripped

    affiliation_keywords = {
        "university",
        "institute",
        "department",
        "laboratory",
        "centre",
        "center",
        "school",
        "college",
        "observatory",
        "academy",
        "faculty",
    }

    def looks_like_affiliation(line):
        lower = line.lower()
        return any(keyword in lower for keyword in affiliation_keywords) or "@" in line

    def looks_like_author(line):
        stripped = line.strip()
        if not stripped or looks_like_affiliation(stripped):
            return False
        words = [word for word in re.split(r"\\s+", stripped) if word]
        if not (1 < len(words) <= 5):
            return False
        for word in words:
            word = word.strip(",.")
            if not word:
                continue
            if word.isupper() and len(word) > 2:
                return False
            if not word[0].isupper():
                return False
        return True

    # Title: first non-empty line after arXiv, until a blank line.
    title_lines = []
    started = False
    title_end_index = 0
    for idx, line in enumerate(header_lines):
        stripped = line.strip()
        if stripped.startswith("arXiv:"):
            continue
        if not started:
            if stripped:
                title_lines.append(stripped)
                started = True
                title_end_index = idx
            continue
        if not stripped:
            break
        title_lines.append(stripped)
        title_end_index = idx

    title = " ".join(title_lines).replace("  ", " ").strip()

    author_lines = []
    name_pattern = re.compile(r"^[A-Z][\\w'.-]+(?:\\s+[A-Z][\\w'.-]+){1,3}$")
    remaining_lines = header_lines[title_end_index + 1 :]
    for idx, line in enumerate(remaining_lines):
        stripped = line.strip()
        next_line = remaining_lines[idx + 1].strip() if idx + 1 < len(remaining_lines) else ""
        if not stripped or looks_like_affiliation(stripped):
            continue
        if "," in stripped:
            continue
        if name_pattern.match(stripped) or looks_like_affiliation(next_line):
            author_lines.append(stripped)

    authors_raw = " and ".join(author_lines).replace("  ", " ").strip()

    # Clean author markers like *, digits, and superscripts.
    authors_raw = re.sub(r"\*", "", authors_raw)
    authors_raw = re.sub(r"\d+", "", authors_raw)
    authors_raw = re.sub(r"\s{2,}", " ", authors_raw).strip(", ")

    author_field = authors_raw

    year = ""
    primary_class = ""
    if arxiv_line:
        class_match = re.search(r"\[(.+?)\]", arxiv_line)
        if class_match:
            primary_class = class_match.group(1)
        year_match = re.search(r"(19|20)\d{2}", arxiv_line)
        if year_match:
            year = year_match.group(0)

    return {
        "title": title,
        "author": author_field,
        "year": year,
        "primary_class": primary_class,
    }


def infer_category(text):
    lower = text.lower()
    downscaling_terms = [
        "downscaling",
        "super-resolution",
        "super resolution",
        "diffusion",
        "generative",
    ]
    forecasting_terms = [
        "limited-area",
        "limited area",
        "lam ",
        "regional",
        "stretched-grid",
        "stretched grid",
    ]
    global_terms = [
        "global",
        "medium-range",
        "medium range",
    ]

    if any(term in lower for term in forecasting_terms):
        return "forecasting"

    if any(term in lower for term in downscaling_terms):
        return "downscaling"

    if any(term in lower for term in global_terms):
        return "global"

    raise RuntimeError(
        "Unable to infer category. Pass --category forecasting|downscaling|global to override."
    )


def bib_entry_exists(path, key):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as handle:
        return f"@misc{{{key}," in handle.read()


def append_bib_entry(path, key, metadata, arxiv_id):
    entry = textwrap.dedent(
        f"""
        @misc{{{key},
          title        = {{{metadata['title']}}},
          author       = {{{metadata['author']}}},
          year         = {{{metadata['year']}}},
          eprint       = {{{arxiv_id}}},
          archivePrefix= {{arXiv}},
          primaryClass = {{{metadata['primary_class']}}},
          url          = {{{arxiv_abs_url(arxiv_id)}}}
        }}
        """
    ).lstrip("\n")

    with open(path, "a", encoding="utf-8") as handle:
        handle.write("\n" + entry)


def yaml_entry_exists(path, key):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as handle:
        return f"- id: {key}" in handle.read()


def append_yaml_entry(path, key):
    skeleton = textwrap.dedent(
        f"""
          - id: {key}
            domain:
              scope: ""
            architecture:
              family: ""
              notes: ""
            outputs:
              probabilistic: false
              ensembles: false
            tags: []
        """
    ).rstrip()

    with open(path, "a", encoding="utf-8") as handle:
        handle.write("\n" + skeleton + "\n")


def generate_id(metadata):
    author_field = metadata.get("author", "")
    first_author = author_field.split(" and ")[0] if author_field else "unknown"
    last_name = re.split(r"\s+", first_author.strip())[-1].lower()
    last_name = re.sub(r"[^a-z0-9]+", "", last_name)

    year = metadata.get("year", "") or "0000"
    title = metadata.get("title", "").lower()
    title = re.sub(r"[^a-z0-9\\s]+", "", title)
    title_words = [word for word in title.split() if word not in {"a", "an", "the", "for", "and"}]
    slug = "_".join(title_words[:3]) if title_words else "paper"
    slug = slug[:40].strip("_") or "paper"

    return f"{last_name}{year}_{slug}"


def main():
    parser = argparse.ArgumentParser(description="Add an arXiv paper to the catalogs.")
    parser.add_argument("url", help="arXiv abs/pdf URL or arXiv id")
    parser.add_argument("--id", help="BibTeX key / YAML id to use")
    parser.add_argument(
        "--category",
        choices=sorted(CATEGORY_FILES.keys()),
        help="Override the inferred catalog (forecasting|downscaling|global)",
    )
    parser.add_argument(
        "--pdf-dir",
        default="pdfs",
        help="Directory to store downloaded PDFs.",
    )
    parser.add_argument(
        "--bib",
        default=os.path.join("database", "references.bib"),
        help="Path to the BibTeX file.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing PDF and append entries even if present.",
    )

    args = parser.parse_args()

    arxiv_id = normalize_arxiv_id(args.url)
    pdf_url = arxiv_pdf_url(arxiv_id)

    os.makedirs(args.pdf_dir, exist_ok=True)
    temp_pdf_path = os.path.join(args.pdf_dir, f"{arxiv_id}.pdf")
    pdf_path = temp_pdf_path
    if os.path.exists(pdf_path) and not args.force:
        print(f"PDF already exists: {pdf_path}")
    else:
        print(f"Downloading {pdf_url}")
        urlretrieve(pdf_url, pdf_path)

    text = run_pdftotext(pdf_path)
    metadata = extract_basic_metadata(text)
    category = args.category or infer_category(text)

    if not metadata["title"]:
        raise RuntimeError("Failed to extract title from PDF.")

    paper_id = args.id or generate_id(metadata)
    final_pdf_path = os.path.join(args.pdf_dir, f"{paper_id}.pdf")
    if os.path.exists(final_pdf_path) and not args.force:
        raise RuntimeError(f"PDF already exists: {final_pdf_path}")
    if final_pdf_path != pdf_path:
        os.replace(pdf_path, final_pdf_path)

    if not metadata["year"]:
        print("Warning: could not infer year from PDF, leaving blank.")

    if not bib_entry_exists(args.bib, paper_id) or args.force:
        append_bib_entry(args.bib, paper_id, metadata, arxiv_id)
        print(f"Appended BibTeX entry to {args.bib}")
    else:
        print(f"BibTeX entry already exists: {paper_id}")

    yaml_path = CATEGORY_FILES[category]
    if not yaml_entry_exists(yaml_path, paper_id) or args.force:
        append_yaml_entry(yaml_path, paper_id)
        print(f"Appended YAML skeleton to {yaml_path}")
    else:
        print(f"YAML entry already exists: {paper_id}")

    print("Done. Review the generated BibTeX/YAML entries for correctness.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
