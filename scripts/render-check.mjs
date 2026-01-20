import { spawn } from "node:child_process";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 4173;
const HOST = "127.0.0.1";
const URL = `http://${HOST}:${PORT}/`;

function waitForServer(timeoutMs = 15000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = request(URL, (res) => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Timed out waiting for preview server"));
          return;
        }
        setTimeout(check, 250);
      });

      req.end();
    };

    check();
  });
}

const preview = spawn(
  "npm",
  ["run", "-s", "preview", "--", "--host", HOST, "--port", String(PORT)],
  { stdio: "inherit" }
);

const shutdown = async (code) => {
  if (preview && !preview.killed) {
    preview.kill("SIGTERM");
  }
  process.exit(code);
};

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

try {
  await waitForServer();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    errors.push(err.message);
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await delay(1000);

  await browser.close();

  if (errors.length) {
    console.error("Console errors detected:\n", errors.join("\n"));
    await shutdown(1);
  }

  console.log("Render check passed with no console errors.");
  await shutdown(0);
} catch (error) {
  console.error(error.message || error);
  await shutdown(1);
}
