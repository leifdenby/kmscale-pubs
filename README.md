# Kilometer-Scale ML Weather Forecasting Dashboard

This repository hosts a small, hot-reloading website that summarizes publications relevant to machine learning based kilometer-scale weather forecasting. The site reads the three YAML catalogs and `references.bib`, joins entries on the shared publication `id`, and renders three tables for quick scanning.

## Data sources

- `database/km_forecasting_models.yaml`: Native km-scale forecasting systems / limited-area models
- `database/km_downscaling_and_generative.yaml`: Downscaling, diffusion, and benchmark work that yields km outputs
- `database/global_drivers_priors.yaml`: Global models used as drivers, priors, or baselines
- `database/references.bib`: BibTeX entries keyed by the same `id` used in the YAML files

## Project structure

- `index.html`: Base layout and section structure
- `src/main.js`: YAML + BibTeX parsing, joining, and table rendering
- `src/style.css`: Visual design (fonts, background, tables, responsive layout)
- `eslint.config.js`: ESLint flat config
- `.pre-commit-config.yaml`: Pre-commit lint hook

## Development

1) Install dependencies

```bash
npm install
```

2) Start the dev server with hot reload

```bash
npm run dev
```

3) Optional: build a production bundle

```bash
npm run build
```

4) Optional: preview the production build

```bash
npm run preview
```

## Render check (headless)

This script builds the site, launches the preview server, opens the page in a
headless browser, and fails if any console errors are detected.

```bash
npx playwright install
npm run test:render
```

### Pre-commit linting

This repo uses pre-commit to run ESLint before commits.

```bash
pip install pre-commit
pre-commit install
```

To run linting manually:

```bash
npm run lint
```

## Updating the content

- Add or edit publications in `database/*.yaml`, ensuring each entry has an `id`.
- Add the matching BibTeX entry with the same key in `database/references.bib`.
- The dev server will hot-reload tables as you save changes.
