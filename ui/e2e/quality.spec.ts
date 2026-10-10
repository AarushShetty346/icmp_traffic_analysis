// Accessibility (axe), overflow, keyboard walkthrough, and route screenshots for docs-ui/screens.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open, watchErrors } from "./helpers";

const ROUTES = ["runs", "signal", "detectors", "stress", "decode", "evidence"];
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "docs-ui");

for (const theme of ["light", "dark"] as const) {
  for (const route of ROUTES) {
    test(`axe: ${route}, ${theme} theme, no critical or serious violations`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.addInitScript((t) => localStorage.setItem("cadence-theme", t), theme);
      await open(page, `#/${route}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const bad = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious")
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(bad).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("no horizontal scroll at 360, 390, 768, 1024, 1440 and 1920 px", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "widths are set inside the test");
  const failures: string[] = [];
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ROUTES) {
      await open(page, `#/${route}`);
      await page.waitForTimeout(150);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > width) failures.push(`${route} at ${width}px: page is ${sw}px wide`);
    }
  }
  expect(failures).toEqual([]);
});

test("keyboard-only walkthrough reaches every view's controls with a visible focus ring", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "recorded once, at desktop size");
  const log: string[] = [];
  for (const route of ROUTES) {
    await open(page, `#/${route}`);
    await page.mouse.click(1, 300);
    const seen: string[] = [];
    let unringed = 0;
    let blanks = 0;
    for (let i = 0; i < 400; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const name = el.getAttribute("aria-label") || (el as HTMLInputElement).labels?.[0]?.textContent || el.textContent || "";
        return { key: `${el.getAttribute("role") || el.tagName.toLowerCase()} "${name.trim().replace(/\s+/g, " ").slice(0, 60)}"`, ring: cs.outlineStyle !== "none" && cs.outlineWidth !== "0px" };
      });
      if (!f) { if (++blanks > 3) break; continue; }
      if (seen.includes(f.key) && seen[0] === f.key) break;
      seen.push(f.key);
      if (!f.ring) unringed++;
      if (seen.length > 1 && f.key.includes("About this project")) break;
    }
    log.push(`### ${route}`, "", `${seen.length} Tab stops, from "${seen[0]}" to "${seen.at(-1)}".`, "", ...seen.map((s, i) => `${i + 1}. ${s}`), "");
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.some((s) => s.includes("Skip to content"))).toBe(true);
    expect(seen.at(-1)).toContain("About this project");
    expect(unringed, `${route}: focused elements without a visible focus ring`).toBe(0);
  }
  // Palette by keyboard: Ctrl+K, type, Enter.
  await open(page, "#/runs");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("decode");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/decode/);
  log.push("### Command palette", "", "Ctrl+K, type `decode`, Enter: opens Decode.", "");
  if (process.env.RECORD) fs.writeFileSync(path.join(out, "keyboard-walkthrough.md"), `# Keyboard walkthrough (recorded by e2e/quality.spec.ts)\n\n${log.join("\n")}`);
});

test("screenshots of every route, light and dark", async ({ page }, info) => {
  test.skip(!process.env.RECORD, "set RECORD=1 to refresh docs-ui/screens");
  const tag = info.project.name.startsWith("mobile") ? "390" : "1440";
  fs.mkdirSync(path.join(out, "screens"), { recursive: true });
  for (const theme of ["light", "dark"]) {
    for (const route of ROUTES) {
      await open(page, `#/${route}`);
      await page.evaluate((t) => localStorage.setItem("cadence-theme", t), theme);
      await page.reload();
      await open(page, `#/${route}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, "screens", `${route}-${theme}-${tag}.png`), fullPage: true });
    }
  }
});
