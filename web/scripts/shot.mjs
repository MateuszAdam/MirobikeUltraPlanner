// Pomocniczy zrzut ekranu w emulacji mobilnej (iPhone SE). Wymaga lokalnego Chrome.
// Użycie: node scripts/shot.mjs <url> <out.png> [selektorDoKliknięcia]
import puppeteer from "puppeteer-core";
const [url, out, click] = process.argv.slice(2);
const b = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox"],
});
const p = await b.newPage();
await p.setViewport({ width: 375, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
if (click) { await p.click(click); await new Promise((r) => setTimeout(r, 600)); }
await p.screenshot({ path: out });
await b.close();
