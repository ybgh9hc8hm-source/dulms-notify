import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stillsOnly = process.argv.includes("--stills");

const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (c) => c,
});

const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
  chromeMode: "chrome-for-testing",
});

const composition = await selectComposition({ serveUrl: bundled, id: "main", puppeteerInstance: browser });

if (stillsOnly) {
  const frames = process.env.FRAMES.split(",").map(Number);
  for (const frame of frames) {
    await renderStill({
      composition,
      serveUrl: bundled,
      frame,
      output: `/tmp/qa/frame-${frame}.png`,
      puppeteerInstance: browser,
    });
    console.log("still", frame);
  }
} else {
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    crf: 18,
    outputLocation: "/mnt/documents/dulms-notify-linkedin/dulms-notify-how-it-works.mp4",
    puppeteerInstance: browser,
    muted: true,
    concurrency: 1,
    onProgress: ({ progress }) => {
      if (Math.round(progress * 100) % 10 === 0) console.log("progress", Math.round(progress * 100));
    },
  });
}

await browser.close({ silent: false });
console.log("DONE", composition.durationInFrames, "frames");
