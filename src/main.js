import yaml from "js-yaml";
import bibtexParse from "bibtex-parse-js";

import forecastingYaml from "../database/km_forecasting_models.yaml?raw";
import downscalingYaml from "../database/km_downscaling_and_generative.yaml?raw";
import globalYaml from "../database/global_drivers_priors.yaml?raw";
import bibText from "../database/references.bib?raw";

const tableTargets = {
  forecasting: document.querySelector("#table-forecasting"),
  downscaling: document.querySelector("#table-downscaling"),
  global: document.querySelector("#table-global"),
};

const countsEl = document.querySelector("#counts");
const updatedEl = document.querySelector("#last-updated");

function safeLoadYaml(text) {
  try {
    const doc = yaml.load(text);
    if (!doc || typeof doc !== "object") {
      return { papers: [] };
    }
    return { papers: Array.isArray(doc.papers) ? doc.papers : [] };
  } catch (error) {
    console.error("YAML parse error", error);
    return { papers: [] };
  }
}

function parseBibtex(text) {
  try {
    const entries = bibtexParse.toJSON(text) || [];
    return new Map(entries.map((entry) => [entry.citationKey, entry]));
  } catch (error) {
    console.error("BibTeX parse error", error);
    return new Map();
  }
}

function normalizeAuthor(author) {
  if (!author) return "";
  if (author.includes(",")) {
    const parts = author.split(",").map((part) => part.trim());
    if (parts.length >= 2) {
      return `${parts[1]} ${parts[0]}`.trim();
    }
  }
  return author.trim();
}

function normalizeBibTags(entry) {
  if (!entry?.entryTags) return {};
  return Object.fromEntries(
    Object.entries(entry.entryTags).map(([key, value]) => [key.toLowerCase(), value])
  );
}

function formatAuthors(bibTags) {
  const authors = bibTags.author;
  if (!authors) return "";
  const list = authors.split(" and ").map(normalizeAuthor).filter(Boolean);
  if (list.length <= 3) {
    return list.join(", ");
  }
  return `${list.slice(0, 3).join(", ")} et al.`;
}

function formatResolution(domain) {
  if (!domain || typeof domain !== "object") return "";
  if (typeof domain.nominal_resolution_km === "number") {
    return `${domain.nominal_resolution_km} km`;
  }
  if (domain.nominal_resolution_km && typeof domain.nominal_resolution_km === "object") {
    const parts = Object.entries(domain.nominal_resolution_km).map(
      ([key, value]) => `${key.replace(/_/g, " ")}: ${value} km`
    );
    return parts.join(" | ");
  }
  if (domain.nominal_resolution_deg) {
    return `${domain.nominal_resolution_deg} deg`;
  }
  if (domain.input_resolution_km || domain.output_resolution_km) {
    const input = domain.input_resolution_km ? `${domain.input_resolution_km} km in` : "";
    const output = domain.output_resolution_km ? `${domain.output_resolution_km} km out` : "";
    return [input, output].filter(Boolean).join(" -> ");
  }
  if (domain.resolution) return String(domain.resolution);
  if (domain.nominal_resolution) return String(domain.nominal_resolution);
  return "";
}

function formatArchitecture(architecture) {
  if (!architecture) return "";
  const family = architecture.family ? String(architecture.family) : "";
  const notes = architecture.notes || architecture.details;
  if (family && notes) return `${family}. ${notes}`;
  return family || notes || "";
}

function collectLinks(bibTags, paper) {
  const links = [];
  const pdf = bibTags.pdf;
  const url = bibTags.url;
  const doi = bibTags.doi;

  if (pdf) links.push(["pdf", pdf]);
  if (url) links.push(["landing", url]);
  if (doi) links.push(["doi", `https://doi.org/${doi}`]);

  if (!pdf && url && url.includes("arxiv.org/abs/")) {
    const arxivId = url.split("arxiv.org/abs/")[1];
    if (arxivId) links.push(["pdf", `https://arxiv.org/pdf/${arxivId}.pdf`]);
  }

  if (!links.length && paper?.links) {
    Object.entries(paper.links).forEach(([label, href]) => {
      if (href) links.push([label, href]);
    });
  }

  return links;
}

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
    const bibEntry = bibMap.get(paper.id);
    const bibTags = normalizeBibTags(bibEntry);
    const title = bibTags.title || paper.title || "Untitled";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${title}</td>
      <td>${bibTags.year || paper.year || ""}</td>
      <td>${formatResolution(paper.domain)}</td>
      <td>${formatArchitecture(paper.architecture)}</td>
      <td>${formatAuthors(bibTags)}</td>
      <td class="links">${formatLinks(bibTags, paper)}</td>
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

function renderAll() {
  const forecasting = safeLoadYaml(forecastingYaml).papers;
  const downscaling = safeLoadYaml(downscalingYaml).papers;
  const global = safeLoadYaml(globalYaml).papers;
  const bibMap = parseBibtex(bibText);

  renderSection(tableTargets.forecasting, forecasting, bibMap);
  renderSection(tableTargets.downscaling, downscaling, bibMap);
  renderSection(tableTargets.global, global, bibMap);

  const total = forecasting.length + downscaling.length + global.length;
  if (countsEl) countsEl.textContent = `${total} papers loaded`;
  if (updatedEl) updatedEl.textContent = `Last updated: ${new Date().toLocaleString()}`;
}

renderAll();

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    renderAll();
  });
}
