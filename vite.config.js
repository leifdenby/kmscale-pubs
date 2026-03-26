import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const ALLOWED_TARGETS = new Map([
  [
    "km_forecasting_models",
    resolve(ROOT_DIR, "database/km_forecasting_models.yaml"),
  ],
  [
    "km_downscaling_and_generative",
    resolve(ROOT_DIR, "database/km_downscaling_and_generative.yaml"),
  ],
  ["global_drivers_priors", resolve(ROOT_DIR, "database/global_drivers_priors.yaml")],
  ["references", resolve(ROOT_DIR, "database/references.bib")],
]);

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (error) {
        rejectBody(error);
      }
    });
    request.on("error", rejectBody);
  });
}

async function handleSourceApi(request, response) {
  const url = new URL(request.url, "http://localhost");
  const target = url.searchParams.get("target");
  const filePath = target ? ALLOWED_TARGETS.get(target) : null;

  if (!filePath) {
    sendJson(response, 400, {
      error: "Unknown target",
      allowedTargets: [...ALLOWED_TARGETS.keys()],
    });
    return;
  }

  if (request.method === "GET") {
    const content = await readFile(filePath, "utf-8");
    sendJson(response, 200, { target, content });
    return;
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await parseBody(request);
    } catch {
      sendJson(response, 400, { error: "Invalid JSON body" });
      return;
    }

    if (typeof body.content !== "string") {
      sendJson(response, 400, { error: "Expected string field 'content'" });
      return;
    }

    await writeFile(filePath, body.content, "utf-8");
    sendJson(response, 200, { ok: true, target });
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}

function sourceApiPlugin() {
  const allowedFiles = new Set(ALLOWED_TARGETS.values());
  const middleware = async (request, response, next) => {
    if (!request.url?.startsWith("/api/source")) {
      next();
      return;
    }

    try {
      await handleSourceApi(request, response);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  };

  return {
    name: "kmscale-source-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    handleHotUpdate(context) {
      if (!allowedFiles.has(context.file)) {
        return;
      }

      context.server.ws.send({
        type: "custom",
        event: "database-updated",
        data: {
          file: context.file,
        },
      });
      return [];
    },
    async writeBundle() {
      const outputDir = resolve(ROOT_DIR, "dist/database");
      await mkdir(outputDir, { recursive: true });
      await Promise.all(
        [...ALLOWED_TARGETS.values()].map((sourcePath) =>
          cp(sourcePath, resolve(outputDir, basename(sourcePath)))
        )
      );
    },
  };
}

export default defineConfig({
  base: "/kmscale-pubs/",
  plugins: [sourceApiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(ROOT_DIR, "index.html"),
        table: resolve(ROOT_DIR, "table/index.html"),
      },
    },
  },
});
