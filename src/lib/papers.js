import yaml from "js-yaml";
import bibtexParse from "bibtex-parse-js";

const STATIC_SOURCE_PATHS = {
  forecasting: "database/km_forecasting_models.yaml",
  downscaling: "database/km_downscaling_and_generative.yaml",
  global: "database/global_drivers_priors.yaml",
  references: "database/references.bib",
};

function buildAssetUrl(path) {
  return new URL(path, window.location.origin + import.meta.env.BASE_URL).toString();
}

async function fetchText(path) {
  const response = await fetch(buildAssetUrl(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.text();
}

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

export function normalizeAuthor(author) {
  if (!author) return "";
  if (author.includes(",")) {
    const parts = author.split(",").map((part) => part.trim());
    if (parts.length >= 2) {
      return `${parts[1]} ${parts[0]}`.trim();
    }
  }
  return author.trim();
}

export function normalizeBibTags(entry) {
  if (!entry?.entryTags) return {};
  return Object.fromEntries(
    Object.entries(entry.entryTags).map(([key, value]) => [key.toLowerCase(), value])
  );
}

export function formatAuthors(bibTags) {
  const authors = bibTags.author;
  if (!authors) return "";
  const list = authors.split(" and ").map(normalizeAuthor).filter(Boolean);
  if (list.length <= 3) {
    return list.join(", ");
  }
  return `${list.slice(0, 3).join(", ")} et al.`;
}

export function formatSpatialResolution(domain) {
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

export function formatTemporalResolution(domain) {
  if (!domain || typeof domain !== "object") return "";
  const temporal = domain.temporal_resolution_hr;
  if (typeof temporal === "number") {
    if (temporal < 1) {
      const minutes = Math.round(temporal * 60);
      return `${minutes} min`;
    }
    return `${temporal} h`;
  }
  if (temporal && typeof temporal === "object") {
    const parts = Object.entries(temporal).map(([key, value]) => {
      if (value < 1) {
        const minutes = Math.round(value * 60);
        return `${key.replace(/_/g, " ")}: ${minutes} min`;
      }
      return `${key.replace(/_/g, " ")}: ${value} h`;
    });
    return parts.join(" | ");
  }
  return "";
}

export function formatResolution(domain) {
  const spatial = formatSpatialResolution(domain);
  const temporal = formatTemporalResolution(domain);
  if (spatial && temporal) return `${spatial} · ${temporal}`;
  return spatial || temporal || "";
}

export function formatArchitecture(architecture) {
  if (!architecture) return "";
  const family = architecture.family ? String(architecture.family) : "";
  const notes = architecture.notes || architecture.details;
  if (family && notes) return `${family}. ${notes}`;
  return family || notes || "";
}

export function collectLinks(bibTags, paper) {
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

export function isProbabilisticPaper(paper) {
  const value = paper.outputs?.probabilistic;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

export function sortPapersByYear(papers, bibMap) {
  return [...papers].sort((a, b) => {
    const aTags = normalizeBibTags(bibMap.get(a.id));
    const bTags = normalizeBibTags(bibMap.get(b.id));
    const aYear = Number(aTags.year || a.year || 0);
    const bYear = Number(bTags.year || b.year || 0);
    if (aYear !== bYear) {
      return bYear - aYear;
    }
    const aTitle = (aTags.title || a.title || "").toLowerCase();
    const bTitle = (bTags.title || b.title || "").toLowerCase();
    return aTitle.localeCompare(bTitle);
  });
}

export async function loadPaperDatabase() {
  const [forecastingYaml, downscalingYaml, globalYaml, bibText] = await Promise.all([
    fetchText(STATIC_SOURCE_PATHS.forecasting),
    fetchText(STATIC_SOURCE_PATHS.downscaling),
    fetchText(STATIC_SOURCE_PATHS.global),
    fetchText(STATIC_SOURCE_PATHS.references),
  ]);

  const forecasting = safeLoadYaml(forecastingYaml).papers;
  const downscaling = safeLoadYaml(downscalingYaml).papers;
  const global = safeLoadYaml(globalYaml).papers;
  const bibMap = parseBibtex(bibText);

  return {
    bibMap,
    sections: {
      forecasting,
      downscaling,
      global,
    },
  };
}

export async function flattenPaperDatabase() {
  const { bibMap, sections } = await loadPaperDatabase();
  const flat = Object.entries(sections).flatMap(([section, papers]) =>
    papers.map((paper) => ({
      ...paper,
      section,
      bibTags: normalizeBibTags(bibMap.get(paper.id)),
    }))
  );
  return { bibMap, papers: flat };
}
