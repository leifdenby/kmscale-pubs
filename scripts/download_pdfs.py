#!/usr/bin/env python3
"""Download PDFs for BibTeX entries into ./pdfs using the citation key as filename."""

import argparse
import os
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ENTRY_START_RE = re.compile(r"@\w+\s*{", re.IGNORECASE)
KEY_RE = re.compile(r"@\w+\s*{\s*([^,\s]+)", re.IGNORECASE)


def extract_entries(text):
    entries = []
    idx = 0
    while True:
        match = ENTRY_START_RE.search(text, idx)
        if not match:
            break
        start = match.start()
        brace_idx = text.find("{", match.end() - 1)
        if brace_idx == -1:
            break
        depth = 0
        end = None
        for pos in range(brace_idx, len(text)):
            char = text[pos]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = pos + 1
                    break
        if end is None:
            break
        entries.append(text[start:end])
        idx = end
    return entries


def parse_fields(entry_text):
    key_match = KEY_RE.search(entry_text)
    if not key_match:
        return None, {}
    key = key_match.group(1).strip()

    body_start = entry_text.find(",", key_match.end())
    if body_start == -1:
        return key, {}

    fields_text = entry_text[body_start + 1 :].strip()
    if fields_text.endswith("}"):
        fields_text = fields_text[:-1]

    fields = {}
    i = 0
    length = len(fields_text)
    while i < length:
        while i < length and fields_text[i] in "\n\r\t ,":
            i += 1
        if i >= length:
            break
        key_start = i
        while i < length and fields_text[i] not in "=":
            i += 1
        field_key = fields_text[key_start:i].strip().lower()
        if not field_key:
            break
        i += 1
        while i < length and fields_text[i] in " \t\n\r":
            i += 1
        if i >= length:
            break
        delimiter = fields_text[i]
        value = ""
        if delimiter in "{\"":
            if delimiter == "{":
                i += 1
                depth = 1
                value_start = i
                while i < length and depth > 0:
                    if fields_text[i] == "{":
                        depth += 1
                    elif fields_text[i] == "}":
                        depth -= 1
                    i += 1
                value = fields_text[value_start : i - 1].strip()
            else:
                i += 1
                value_start = i
                while i < length and fields_text[i] != "\"":
                    i += 1
                value = fields_text[value_start:i].strip()
                i += 1
        else:
            value_start = i
            while i < length and fields_text[i] not in ",\n":
                i += 1
            value = fields_text[value_start:i].strip()
        fields[field_key] = value
        while i < length and fields_text[i] not in "\n":
            if fields_text[i] == ",":
                i += 1
                break
            i += 1
    return key, fields


def derive_pdf_url(fields):
    if not fields:
        return None
    pdf_url = fields.get("pdf") or fields.get("file")
    if pdf_url and pdf_url.lower().endswith(".pdf"):
        return pdf_url

    url = fields.get("url", "")
    if url.endswith(".pdf"):
        return url
    if "arxiv.org/abs/" in url:
        arxiv_id = url.split("arxiv.org/abs/")[-1]
        return f"https://arxiv.org/pdf/{arxiv_id}.pdf"

    eprint = fields.get("eprint")
    archive_prefix = fields.get("archiveprefix", "").lower()
    if eprint and archive_prefix == "arxiv":
        return f"https://arxiv.org/pdf/{eprint}.pdf"

    return None


def download_with_progress(url, dest_path, index, total):
    request = Request(url, headers={"User-Agent": "kmscale-pubs/1.0"})
    with urlopen(request, timeout=30) as response:
        total_bytes = response.headers.get("Content-Length")
        total_bytes = int(total_bytes) if total_bytes and total_bytes.isdigit() else None
        downloaded = 0
        chunk_size = 1024 * 64

        with open(dest_path, "wb") as file_handle:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                file_handle.write(chunk)
                downloaded += len(chunk)
                if total_bytes:
                    percent = downloaded / total_bytes * 100
                    status = f"[{index}/{total}] {os.path.basename(dest_path)} {percent:5.1f}%"
                else:
                    status = f"[{index}/{total}] {os.path.basename(dest_path)} {downloaded // 1024} KB"
                print(status, end="\r", flush=True)
    print(" " * 80, end="\r", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Download PDFs for BibTeX entries.")
    parser.add_argument(
        "--bib",
        default=os.path.join("database", "references.bib"),
        help="Path to the BibTeX file.",
    )
    parser.add_argument(
        "--out",
        default="pdfs",
        help="Output directory for downloaded PDFs.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Redownload PDFs even if they already exist.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.25,
        help="Delay between downloads in seconds.",
    )
    args = parser.parse_args()

    with open(args.bib, "r", encoding="utf-8") as handle:
        text = handle.read()

    entries = extract_entries(text)
    parsed = []
    for entry in entries:
        key, fields = parse_fields(entry)
        if key:
            parsed.append((key, fields))

    os.makedirs(args.out, exist_ok=True)

    total = len(parsed)
    skipped = []
    failed = []

    for index, (key, fields) in enumerate(parsed, start=1):
        pdf_url = derive_pdf_url(fields)
        if not pdf_url:
            skipped.append((key, "no PDF url found"))
            continue

        filename = f"{key}.pdf"
        dest_path = os.path.join(args.out, filename)
        if os.path.exists(dest_path) and not args.force:
            print(f"[{index}/{total}] {filename} already exists, skipping.")
            continue

        try:
            download_with_progress(pdf_url, dest_path, index, total)
            print(f"[{index}/{total}] Downloaded {filename}")
        except (HTTPError, URLError, TimeoutError) as exc:
            failed.append((key, str(exc)))
            if os.path.exists(dest_path):
                os.remove(dest_path)
            print(f"[{index}/{total}] Failed {filename}: {exc}")
        time.sleep(args.delay)

    if skipped:
        print("\nSkipped entries:")
        for key, reason in skipped:
            print(f"- {key}: {reason}")

    if failed:
        print("\nFailed downloads:")
        for key, reason in failed:
            print(f"- {key}: {reason}")

    if not skipped and not failed:
        print("\nAll PDFs downloaded successfully.")


if __name__ == "__main__":
    main()
