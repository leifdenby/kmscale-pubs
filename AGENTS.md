# Agent Notes

This repo is a Vite-based static site that renders three publication tables by joining YAML entries with BibTeX metadata.

## Working conventions

- Keep YAML `id` values synced with BibTeX keys in `database/references.bib`.
- Citation metadata (title, authors, venue, URLs) lives in `database/references.bib`, not the YAML files.
- Rendering happens client-side in `src/main.js`; avoid server-side assumptions.
- Preserve the existing visual language in `src/style.css` unless asked to redesign.
- Prefer small, targeted edits; avoid regenerating the YAML/BibTeX unless requested.
- For new arXiv papers, follow the repeatable workflow below.

## Useful commands

- `npm install`
- `npm run dev`
- `npm run lint`
- `pre-commit install`

## Add new arXiv paper (repeatable workflow)

Use `scripts/add_arxiv_paper.py` to add a paper by arXiv URL or id. This script downloads the PDF, extracts basic citation metadata, appends a BibTeX entry, and inserts a YAML skeleton in the chosen catalog. Review and edit the YAML fields afterward.

Example:

```bash
python3 scripts/add_arxiv_paper.py --id <bib_key> https://arxiv.org/abs/2507.18378
```

Notes:
- Valid categories: `forecasting`, `downscaling`, `global`
- The script needs `pdftotext` available in PATH.
- If `--id` is omitted, the script generates a BibTeX key from the first author, year, and title.
