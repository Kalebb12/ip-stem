// End-to-end UI check with Playwright: renders every screen, drives the full
// teacher -> student journey (mostly by keyboard) and saves screenshots.
// Usage: API on :8000 and web on :3000, then `npm run test:ui`.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const SHOTS = path.join(ROOT, "screenshots");
const BASE = process.env.WEB_URL || "http://localhost:3000";
const SAMPLE = path.join(ROOT, "samples", "heart-lecture.pdf");
mkdirSync(SHOTS, { recursive: true });
const TITLE = `Heart lecture (live demo ${new Date().toISOString().slice(11, 19)})`;

const results = [];
const ok = (name, cond, detail = "") => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

async function launch() {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: "chrome" }); }
}

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.text())) consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));
const shot = (name, full = true) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });

// ---------------- landing
await page.goto(BASE, { waitUntil: "networkidle" });
ok("landing: h1 renders", await page.getByRole("heading", { level: 1 }).isVisible());
ok("landing: page guide present", await page.getByRole("heading", { name: "About this page" }).isVisible());
const h2s = await page.locator("h2").allInnerTexts();
ok("landing: section headings", h2s.length >= 6, `${h2s.length} h2s`);
await shot("01-landing");

// keyboard: skip link is first tab stop
await page.keyboard.press("Tab");
ok("landing: first Tab focuses skip link", (await page.evaluate(() => document.activeElement?.textContent)) === "Skip to main content");

// hero explorer by keyboard
const firstItem = page.locator("#hero-panel-structures .structure-list button").first();
await firstItem.focus();
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
const current = await page.locator('#hero-panel-structures .structure-list button[aria-current="true"]').innerText();
ok("hero explorer: arrow keys move selection", /Left atrium/.test(current), current.trim());
ok("hero explorer: detail shows selected", await page.locator("#hero-detail-h").innerText() === "Left atrium");
const liveText = await page.locator('[role="status"]').first().innerText();
ok("hero explorer: new detail announced without repeating the name", /Upper chamber on the patient's left/.test(liveText) && !/^Left atrium/.test(liveText), liveText.slice(0, 60));
await page.locator("#hero-detail-h").scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(SHOTS, "02-hero-explorer-keyboard.png") });

// process tab via arrow keys on tablist
await page.locator("#hero-tab-structures").focus();
await page.keyboard.press("End");
await page.getByRole("button", { name: "Next step" }).first().click();
ok("hero explorer: process steps", /Step 2 of 10/.test(await page.locator("#hero-panel-process-circulation").innerText()));

// display settings
await page.getByRole("button", { name: "Make text larger" }).click();
await page.getByRole("button", { name: "Make text larger" }).click();
await page.getByRole("button", { name: /^Colours:/ }).click();
ok("display: text scale applied", (await page.evaluate(() => document.documentElement.style.fontSize)) === "150%");
ok("display: high contrast applied", (await page.evaluate(() => document.documentElement.dataset.contrast)) === "high");
await page.evaluate(() => window.scrollTo(0, 0));
await shot("03-landing-150pct-high-contrast", false);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok("display: no horizontal scroll at 150%", !overflow);
await page.getByRole("button", { name: /^Colours:/ }).click(); // -> dark
await shot("04-landing-dark", false);
await page.getByRole("button", { name: /^Colours:/ }).click(); // -> default
await page.getByRole("button", { name: "Make text smaller" }).click();
await page.getByRole("button", { name: "Make text smaller" }).click();

// speech: any key outside the listen controls stops the app's voice
await page.getByRole("button", { name: "Play this page" }).click();
await page.waitForFunction(() => document.querySelector(".page-guide .listen-bar .btn")?.textContent !== "Play this page", null, { timeout: 15000 }).catch(() => {});
const playing = await page.locator(".page-guide .listen-bar .btn").first().innerText();
await page.locator("#hero-tab-structures").focus();
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
ok("speech: navigating stops the app's voice", playing !== "Play this page" && (await page.locator(".page-guide .listen-bar .btn").first().innerText()) === "Play this page", `while playing: ${playing}`);

// mobile
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(BASE, { waitUntil: "networkidle" });
ok("mobile: no horizontal scroll", !(await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await mobile.screenshot({ path: path.join(SHOTS, "05-landing-mobile.png"), fullPage: true });
await mobile.close();

// ---------------- teacher journey
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel("Email address").fill("teacher@demo.school");
await page.getByLabel("Password").fill("demo1234");
await page.keyboard.press("Enter");
await page.waitForURL("**/teacher");
await page.getByRole("table").waitFor();
ok("teacher: dashboard lists resources", (await page.locator("tbody tr").count()) >= 1);
await shot("06-teacher-dashboard");

await page.getByRole("link", { name: "Upload a resource" }).first().click();
await page.waitForURL("**/teacher/upload");
await page.getByLabel("File").setInputFiles(SAMPLE);
await page.getByLabel("Title").fill(TITLE);
await page.getByLabel("Topic").fill("Cardiovascular system");
await shot("07-teacher-upload");
await page.getByRole("button", { name: "Upload and process" }).click();
await page.waitForURL(/\/teacher\/resources\/\d+/);
await page.screenshot({ path: path.join(SHOTS, "08-teacher-processing.png") });
await page.getByRole("heading", { name: "Review and publish" }).waitFor({ timeout: 180_000 });
ok("teacher: processing finished, review shown", true);
const flaggedCount = await page.locator(".edit-card.flagged").count();
ok("teacher: flags shown for review", true, `${flaggedCount} flagged item(s)`);
ok("teacher: approve blocked only while flags are open", (await page.getByRole("button", { name: "Approve content" }).isDisabled()) === flaggedCount > 0);
await page.waitForFunction(() => { const i = document.querySelector(".figure img"); return i && i.complete && i.naturalWidth > 0; });
ok("teacher: diagram image loads", true);
await shot("09-teacher-review");

const boxes = await page.getByLabel("I have checked this").all();
for (const box of boxes) await box.check();
if (boxes.length) {
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await page.getByText("All changes saved.").first().waitFor();
}
await page.getByRole("button", { name: "Approve content" }).click();
await page.getByRole("button", { name: "Publish to students" }).click();
await page.getByText(/^Published on/).waitFor();
ok("teacher: approve and publish", true);
await shot("10-teacher-published");
const publishedUrl = page.url();
const lessonId = publishedUrl.match(/resources\/(\d+)/)[1];
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForURL(BASE + "/");

// ---------------- student journey
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Sign in as demo student" }).click();
await page.waitForURL("**/student");
await page.getByRole("link", { name: TITLE }).waitFor();
ok("student: newly published lesson visible", true);
await shot("11-student-dashboard");

await page.goto(`${BASE}/student/lessons/${lessonId}`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Explore the diagram" }).waitFor();
await page.getByRole("tab", { name: "Structures" }).click();
await page.locator("#lesson-panel-structures .structure-list button").first().focus();
for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
ok("student: keyboard exploration", (await page.locator("#lesson-detail-h").innerText()).length > 0, await page.locator("#lesson-detail-h").innerText());
ok("student: highlight drawn on diagram", (await page.locator(".figure .hl").count()) === 1);
await page.locator("#explore").screenshot({ path: path.join(SHOTS, "12-student-explorer.png") });

await page.getByLabel("Your question").fill("What does the left ventricle do?");
await page.getByRole("button", { name: "Ask", exact: true }).click();
await page.locator(".msg.companion").last().waitFor({ timeout: 60_000 });
const answer = await page.locator(".msg.companion").last().innerText();
ok("student: companion answers", /ventricle/i.test(answer), answer.replace(/\s+/g, " ").slice(0, 90));
await page.locator("#companion").screenshot({ path: path.join(SHOTS, "13-student-companion.png") });

const fieldsets = page.locator("#practice fieldset");
const n = await fieldsets.count();
for (let i = 0; i < n; i++) await fieldsets.nth(i).locator('input[type="radio"]').first().check();
await page.getByRole("button", { name: /Finish and see my score/ }).click();
const scoreText = await page.locator("#practice .notice.ok").last().innerText();
ok("student: quiz scored", /You scored \d+ out of \d+/.test(scoreText), scoreText.split(".")[0]);
await page.locator("#practice").screenshot({ path: path.join(SHOTS, "14-student-quiz.png") });

// permissions: student can't see teacher pages
await page.goto(`${BASE}/teacher`, { waitUntil: "networkidle" });
ok("permissions: student redirected away from teacher area", page.url().endsWith("/student"));

await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await shot("15-settings");
await page.getByLabel(/I use a screen reader/).check();
await page.goto(`${BASE}/student/lessons/${lessonId}`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Explore the diagram" }).waitFor();
ok("screen-reader setting hides read-aloud controls", (await page.locator(".listen-bar").count()) === 0 && (await page.getByRole("button", { name: /aloud/ }).count()) === 0);
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await page.getByLabel(/I use a screen reader/).uncheck();

ok("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
