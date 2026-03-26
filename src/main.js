import {
  collectLinks,
  formatArchitecture,
  formatAuthors,
  formatResolution,
  isProbabilisticPaper,
  loadPaperDatabase,
  normalizeBibTags,
  sortPapersByYear,
} from "./lib/papers.js";

const tableTargets = {
  forecastingDeterministic: document.querySelector("#table-forecasting-deterministic"),
  forecastingProbabilistic: document.querySelector("#table-forecasting-probabilistic"),
  downscalingDeterministic: document.querySelector("#table-downscaling-deterministic"),
  downscalingProbabilistic: document.querySelector("#table-downscaling-probabilistic"),
  global: document.querySelector("#table-global"),
};

const countsEl = document.querySelector("#counts");
const updatedEl = document.querySelector("#last-updated");

function formatLinks(bibTags, paper) {
  const entries = collectLinks(bibTags, paper);
  if (!entries.length) return "";

  return entries
    .map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`)
    .join(" ");
}

function formatTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return "";
  return `<div class="badges">${tags
    .map((tag) => `<span class="badge">${tag}</span>`)
    .join("")}</div>`;
}

function buildTable(papers, bibMap) {
  const table = document.createElement("table");
  table.className = "table";

  table.innerHTML = `
    <thead>
      <tr>
        <th>Title</th>
        <th>Year</th>
        <th>Resolution</th>
        <th>Architecture</th>
        <th>Authors</th>
        <th>Links</th>
        <th>Tags</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");

  papers.forEach((paper) => {
    const bibTags = normalizeBibTags(bibMap.get(paper.id));
    const title = bibTags.title || paper.title || "Untitled";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${title}</td>
      <td>${bibTags.year || paper.year || ""}</td>
      <td>${formatResolution(paper.domain)}</td>
      <td>${formatArchitecture(paper.architecture)}</td>
      <td>${formatAuthors(bibTags)}</td>
      <td><div class="links">${formatLinks(bibTags, paper)}</div></td>
      <td>${formatTags(paper.tags)}</td>
    `;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

function renderSection(target, papers, bibMap) {
  if (!target) return;
  target.innerHTML = "";
  target.appendChild(buildTable(papers, bibMap));
}

async function renderAll() {
  const { sections, bibMap } = await loadPaperDatabase();
  const forecastingDeterministic = sections.forecasting.filter(
    (paper) => !isProbabilisticPaper(paper)
  );
  const forecastingProbabilistic = sections.forecasting.filter(isProbabilisticPaper);
  const downscalingDeterministic = sections.downscaling.filter(
    (paper) => !isProbabilisticPaper(paper)
  );
  const downscalingProbabilistic = sections.downscaling.filter(isProbabilisticPaper);

  renderSection(
    tableTargets.forecastingDeterministic,
    sortPapersByYear(forecastingDeterministic, bibMap),
    bibMap
  );
  renderSection(
    tableTargets.forecastingProbabilistic,
    sortPapersByYear(forecastingProbabilistic, bibMap),
    bibMap
  );
  renderSection(
    tableTargets.downscalingDeterministic,
    sortPapersByYear(downscalingDeterministic, bibMap),
    bibMap
  );
  renderSection(
    tableTargets.downscalingProbabilistic,
    sortPapersByYear(downscalingProbabilistic, bibMap),
    bibMap
  );
  renderSection(tableTargets.global, sortPapersByYear(sections.global, bibMap), bibMap);

  const total =
    sections.forecasting.length + sections.downscaling.length + sections.global.length;
  if (countsEl) countsEl.textContent = `${total} papers loaded`;
  if (updatedEl) updatedEl.textContent = `Last updated: ${new Date().toLocaleString()}`;
}

void renderAll();

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    void renderAll();
  });
  import.meta.hot.on("database-updated", () => {
    void renderAll();
  });
}
