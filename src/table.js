import yaml from "js-yaml";

import {
  flattenPaperDatabase,
  formatAuthors,
  formatResolution,
  normalizeBibTags,
  sortPapersByYear,
} from "./lib/papers.js";

const STORAGE_KEY = "kmscale-paper-drafts";
const TARGET_BY_SECTION = {
  forecasting: "km_forecasting_models",
  downscaling: "km_downscaling_and_generative",
  global: "global_drivers_priors",
};

const rowsEl = document.querySelector("#editor-rows");
const searchEl = document.querySelector("#paper-search");
const sectionFilterEl = document.querySelector("#section-filter");
const formEl = document.querySelector("#paper-form");
const titleEl = document.querySelector("#editor-title");
const subtitleEl = document.querySelector("#editor-subtitle");
const linkButtons = document.querySelectorAll("[data-link-target]");
const saveToastEl = document.querySelector("#save-toast");
const saveToastTextEl = document.querySelector("#save-toast-text");

let drafts = loadDrafts();
let basePapers = [];
let selectedId = null;
let isHydratingForm = false;
let autosaveTimer = null;
let saveToastTimer = null;
let saveSequence = 0;

function loadDrafts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistDrafts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergePaper(paper) {
  const draft = drafts[paper.id] || {};
  return {
    ...paper,
    section: draft.section || paper.section,
    bibTags: {
      ...paper.bibTags,
      ...(draft.bibTags || {}),
    },
    domain: {
      ...(paper.domain || {}),
      ...(draft.domain || {}),
    },
    architecture: {
      ...(paper.architecture || {}),
      ...(draft.architecture || {}),
    },
    outputs: {
      ...(paper.outputs || {}),
      ...(draft.outputs || {}),
    },
    tags: draft.tags || paper.tags || [],
  };
}

function stringToMaybeObject(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes(":")) {
    const numberValue = Number(trimmed);
    return Number.isNaN(numberValue) ? trimmed : numberValue;
  }

  const entries = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      const key = line.slice(0, separatorIndex).trim().replace(/\s+/g, "_");
      const rawValue = line.slice(separatorIndex + 1).trim();
      const numeric = Number(rawValue);
      return [key, Number.isNaN(numeric) ? rawValue : numeric];
    });
  return Object.fromEntries(entries);
}

function maybeObjectToString(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, inner]) => `${key.replace(/_/g, " ")}: ${inner}`)
      .join("\n");
  }
  return String(value);
}

function getSelectedPaper() {
  return basePapers.find((paper) => paper.id === selectedId) || null;
}

async function refreshFromDatabase() {
  const { papers, bibMap } = await flattenPaperDatabase();
  basePapers = sortPapersByYear(
    papers.map(({ ...paper }) => paper),
    bibMap
  ).map((paper) => ({
    ...paper,
    bibTags: normalizeBibTags(bibMap.get(paper.id)),
  }));

  if (!basePapers.length) {
    selectedId = null;
    rowsEl.innerHTML = "";
    titleEl.textContent = "No papers found";
    subtitleEl.textContent = "Check the database files.";
    formEl.reset();
    return;
  }

  if (!basePapers.some((paper) => paper.id === selectedId)) {
    selectedId = basePapers[0].id;
  }

  renderRows();
  renderEditor();
}

function showToast(message, tone = "ok") {
  saveToastTextEl.textContent = message;
  saveToastEl.classList.add("is-visible");
  saveToastEl.classList.toggle("is-error", tone === "error");
  saveToastEl.setAttribute("aria-hidden", "false");

  window.clearTimeout(saveToastTimer);
  saveToastTimer = window.setTimeout(() => {
    saveToastEl.classList.remove("is-visible");
    saveToastEl.setAttribute("aria-hidden", "true");
  }, 1800);
}

function renderRows() {
  const query = searchEl.value.trim().toLowerCase();
  const sectionFilter = sectionFilterEl.value;

  const filtered = basePapers
    .map(mergePaper)
    .filter((paper) => {
      if (sectionFilter !== "all" && paper.section !== sectionFilter) return false;
      if (!query) return true;
      const haystack = [
        paper.id,
        paper.section,
        paper.bibTags.title,
        paper.bibTags.author,
        ...(paper.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

  rowsEl.innerHTML = "";

  filtered.forEach((paper) => {
    const row = document.createElement("tr");
    row.className = paper.id === selectedId ? "is-active" : "";
    row.innerHTML = `
      <td>${paper.bibTags.title || "Untitled"}</td>
      <td>${paper.section}</td>
      <td>${paper.bibTags.year || ""}</td>
      <td>${formatResolution(paper.domain)}</td>
    `;
    row.addEventListener("click", () => {
      selectedId = paper.id;
      renderRows();
      renderEditor();
    });
    rowsEl.appendChild(row);
  });
}

function renderEditor() {
  const paper = getSelectedPaper();
  if (!paper) return;
  const merged = mergePaper(paper);
  isHydratingForm = true;

  titleEl.textContent = merged.bibTags.title || paper.id;
  subtitleEl.textContent = `${paper.id} · ${formatAuthors(merged.bibTags) || "No author metadata"}`;

  formEl.elements.title.value = merged.bibTags.title || "";
  formEl.elements.author.value = merged.bibTags.author || "";
  formEl.elements.year.value = merged.bibTags.year || "";
  formEl.elements.url.value = merged.bibTags.url || "";
  formEl.elements.pdf.value = merged.bibTags.pdf || "";
  formEl.elements.doi.value = merged.bibTags.doi || "";
  formEl.elements.section.value = merged.section || paper.section;
  formEl.elements.scope.value = merged.domain?.scope || "";
  formEl.elements.spatial.value = maybeObjectToString(
    merged.domain?.nominal_resolution_km ??
      (merged.domain?.output_resolution_km != null ? merged.domain.output_resolution_km : "")
  );
  formEl.elements.temporal.value = maybeObjectToString(merged.domain?.temporal_resolution_hr);
  formEl.elements.family.value = merged.architecture?.family || "";
  formEl.elements.notes.value = merged.architecture?.notes || "";
  formEl.elements.tags.value = (merged.tags || []).join(", ");
  formEl.elements.probabilistic.checked = Boolean(merged.outputs?.probabilistic);
  formEl.elements.ensembles.checked = Boolean(merged.outputs?.ensembles);

  updateLinkButtons();
  isHydratingForm = false;
}

function collectFormState() {
  const paper = getSelectedPaper();
  if (!paper) return null;

  const draft = deepClone(drafts[paper.id] || {});
  draft.section = formEl.elements.section.value;
  draft.bibTags = {
    ...(draft.bibTags || {}),
    title: formEl.elements.title.value.trim(),
    author: formEl.elements.author.value.trim(),
    year: formEl.elements.year.value.trim(),
    url: formEl.elements.url.value.trim(),
    pdf: formEl.elements.pdf.value.trim(),
    doi: formEl.elements.doi.value.trim(),
  };
  draft.domain = {
    ...(draft.domain || {}),
    scope: formEl.elements.scope.value.trim(),
    temporal_resolution_hr: stringToMaybeObject(formEl.elements.temporal.value),
  };

  const spatialValue = stringToMaybeObject(formEl.elements.spatial.value);
  delete draft.domain.nominal_resolution_km;
  delete draft.domain.output_resolution_km;
  if (typeof spatialValue === "number" || (spatialValue && typeof spatialValue === "object")) {
    draft.domain.nominal_resolution_km = spatialValue;
  } else if (typeof spatialValue === "string" && spatialValue) {
    draft.domain.output_resolution_km = spatialValue;
  }

  draft.architecture = {
    ...(draft.architecture || {}),
    family: formEl.elements.family.value.trim(),
    notes: formEl.elements.notes.value.trim(),
  };
  draft.outputs = {
    ...(draft.outputs || {}),
    probabilistic: formEl.elements.probabilistic.checked,
    ensembles: formEl.elements.ensembles.checked,
  };
  draft.tags = formEl.elements.tags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return draft;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatBibField(field, value) {
  return `  ${field.padEnd(13, " ")} = {${value}},`;
}

function updateBibEntry(content, paperId, fields) {
  const entryRegex = new RegExp(`@\\w+\\{${escapeRegExp(paperId)},[\\s\\S]*?\\n\\}`, "m");
  const match = content.match(entryRegex);
  if (!match) {
    throw new Error(`BibTeX entry not found for ${paperId}`);
  }

  let block = match[0];
  ["title", "author", "year", "url", "pdf", "doi"].forEach((field) => {
    const lineRegex = new RegExp(`^\\s*${field}\\s*=\\s*\\{.*\\},?\\s*$`, "m");
    const value = fields[field] || "";
    if (!value) {
      block = block.replace(new RegExp(`^\\s*${field}\\s*=\\s*\\{.*\\},?\\s*\\n?`, "m"), "");
      return;
    }
    const replacement = formatBibField(field, value);
    if (lineRegex.test(block)) {
      block = block.replace(lineRegex, replacement);
    } else {
      const lines = block.split("\n");
      lines.splice(1, 0, replacement);
      block = lines.join("\n");
    }
  });

  return content.replace(entryRegex, block);
}

async function fetchSource(target) {
  const response = await fetch(`/api/source?target=${target}`);
  if (!response.ok) {
    throw new Error(`Failed to read ${target}`);
  }
  return response.json();
}

async function writeSource(target, content) {
  const response = await fetch(`/api/source?target=${target}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Failed to write ${target}`);
  }
}

async function saveToSource(paper, draft) {
  const nextPaper = mergePaper({
    ...paper,
    section: draft.section,
    bibTags: {
      ...paper.bibTags,
      ...draft.bibTags,
    },
    domain: {
      ...(paper.domain || {}),
      ...(draft.domain || {}),
    },
    architecture: {
      ...(paper.architecture || {}),
      ...(draft.architecture || {}),
    },
    outputs: {
      ...(paper.outputs || {}),
      ...(draft.outputs || {}),
    },
    tags: draft.tags,
  });

  const yamlTargets = Object.values(TARGET_BY_SECTION);
  const yamlDocs = await Promise.all(yamlTargets.map((target) => fetchSource(target)));
  const parsedDocs = Object.fromEntries(
    yamlDocs.map(({ target, content }) => [
      target,
      yaml.load(content) || { papers: [] },
    ])
  );

  yamlTargets.forEach((target) => {
    const papersList = Array.isArray(parsedDocs[target].papers) ? parsedDocs[target].papers : [];
    parsedDocs[target].papers = papersList.filter((entry) => entry.id !== paper.id);
  });

  const nextYamlEntry = {
    id: paper.id,
    domain: nextPaper.domain || {},
    architecture: nextPaper.architecture || {},
    outputs: nextPaper.outputs || {},
    tags: nextPaper.tags || [],
  };
  parsedDocs[TARGET_BY_SECTION[nextPaper.section]].papers.push(nextYamlEntry);

  await Promise.all(
    yamlTargets.map((target) =>
      writeSource(
        target,
        yaml.dump(parsedDocs[target], {
          lineWidth: -1,
          noRefs: true,
          sortKeys: false,
        })
      )
    )
  );

  const references = await fetchSource("references");
  const nextBib = updateBibEntry(references.content, paper.id, nextPaper.bibTags);
  await writeSource("references", nextBib);

  Object.assign(paper, nextPaper);
  delete drafts[paper.id];
  persistDrafts();
}

async function saveCurrentDraft() {
  const paper = getSelectedPaper();
  if (!paper) return;

  const draft = collectFormState();
  if (!draft) return;

  drafts[paper.id] = draft;
  persistDrafts();
  const saveId = ++saveSequence;

  try {
    await saveToSource(paper, draft);
    if (saveId !== saveSequence) return;
    showToast("Saved", "ok");
    renderRows();
    renderEditor();
  } catch (error) {
    if (saveId !== saveSequence) return;
    showToast(error instanceof Error ? error.message : "Save failed", "error");
    renderRows();
  }
}

function updateLinkButtons() {
  linkButtons.forEach((button) => {
    const target = button.dataset.linkTarget;
    const rawValue = formEl.elements[target]?.value?.trim() || "";
    const href = target === "doi" && rawValue ? `https://doi.org/${rawValue}` : rawValue;
    if (href) {
      button.href = href;
      button.classList.remove("is-disabled");
    } else {
      button.href = "#";
      button.classList.add("is-disabled");
    }
  });
}

function scheduleAutosave() {
  if (isHydratingForm) return;
  const draft = collectFormState();
  const paper = getSelectedPaper();
  if (!paper || !draft) return;

  drafts[paper.id] = draft;
  persistDrafts();
  renderRows();
  updateLinkButtons();

  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    void saveCurrentDraft();
  }, 1200);
}

searchEl.addEventListener("input", renderRows);
sectionFilterEl.addEventListener("change", renderRows);
formEl.addEventListener("submit", (event) => {
  event.preventDefault();
});
["url", "pdf", "doi"].forEach((name) => {
  formEl.elements[name].addEventListener("input", updateLinkButtons);
});
[
  "title",
  "author",
  "year",
  "url",
  "pdf",
  "doi",
  "section",
  "scope",
  "spatial",
  "temporal",
  "family",
  "notes",
  "tags",
  "probabilistic",
  "ensembles",
].forEach((name) => {
  const field = formEl.elements[name];
  const eventName =
    field instanceof HTMLInputElement &&
    (field.type === "checkbox" || field.tagName === "SELECT")
      ? "change"
      : "input";
  field.addEventListener(eventName, scheduleAutosave);
  if (eventName !== "change") {
    field.addEventListener("change", scheduleAutosave);
  }
});

void refreshFromDatabase();

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    void refreshFromDatabase();
  });
  import.meta.hot.on("database-updated", () => {
    void refreshFromDatabase();
  });
}
