# Agent Notes

This repo is a Vite-based static site that renders three publication tables by joining YAML entries with BibTeX metadata.

## Working conventions

- Keep YAML `id` values synced with BibTeX keys in `database/references.bib`.
- Rendering happens client-side in `src/main.js`; avoid server-side assumptions.
- Preserve the existing visual language in `src/style.css` unless asked to redesign.
- Prefer small, targeted edits; avoid regenerating the YAML/BibTeX unless requested.

## Useful commands

- `npm install`
- `npm run dev`
- `npm run lint`
- `pre-commit install`
