// Every control works: driven by controls.manifest.json, at every viewport project.
import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { controls, open, upload, watchErrors } from "./helpers";

interface Entry {
  route: string; role: string; name: string; regex: boolean; action: string; effect: string;
  expect: Record<string, string | boolean>; start?: string; before?: (string | { role: string; name: string; regex: boolean })[];
  all?: boolean; key?: string; optional?: boolean;
}
const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(here, "controls.manifest.json"), "utf8")) as { scans: Record<string, string[]>; controls: Entry[] };

const matches = (e: Entry, name: string) => (e.regex ? new RegExp(e.name).test(name) : e.name === name);
const nameOf = (e: Entry) => (e.regex ? new RegExp(e.name) : e.name);
const hashOf = (page: Page) => page.evaluate(() => decodeURIComponent(window.location.hash));
const routeStart = (e: Entry) => e.start ?? (e.route === "*" ? "#/runs" : e.route === "palette" ? "#/stress" : `#/${e.route}`);

async function openPalette(page: Page) {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox", { name: "Search commands" })).toBeVisible();
}

async function stateOf(el: Locator) {
  return el.evaluate((n) => {
    const h = n as HTMLInputElement;
    return JSON.stringify([h.value, h.checked, n.getAttribute("aria-valuenow"), n.getAttribute("aria-checked"), n.getAttribute("aria-pressed"), n.getAttribute("data-state")]);
  });
}

async function act(page: Page, e: Entry, el: Locator) {
  const x = e.expect;
  const beforeHash = await hashOf(page);
  const beforeText = await page.locator("main").innerText();
  const beforeState = e.action === "inspect" ? "" : await stateOf(el);
  const beforeTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? "system");
  await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
  const download = x.download ? page.waitForEvent("download") : null;
  const chooser = x.filechooser ? page.waitForEvent("filechooser") : null;

  switch (e.action) {
    case "click": await el.click(); break;
    case "focus-enter": await el.focus(); await page.keyboard.press("Enter"); break;
    case "key": await el.focus(); await page.keyboard.press(e.key ?? "ArrowRight"); break;
    case "fill": await el.fill("0101"); await el.blur(); break;
    case "fill-enter": await el.fill(e.expect.hash === "^#/evidence" ? "Go to Evidence" : "x"); await page.keyboard.press("Enter"); break;
    case "select": {
      const values = await el.evaluate((s) => [...(s as HTMLSelectElement).options].map((o) => o.value));
      const current = await el.inputValue();
      const next = [...values].reverse().find((v) => v !== current);
      expect(next, `${e.name} has another option`).toBeDefined();
      await el.selectOption(next!);
      break;
    }
    case "inspect": break;
    default: throw new Error(`unknown action ${e.action}`);
  }

  if (x.hash) await expect.poll(() => hashOf(page)).toMatch(new RegExp(String(x.hash)));
  if (x.hashNot) await expect.poll(() => hashOf(page)).not.toMatch(new RegExp(String(x.hashNot)));
  if (x.hash && !String(x.hash).startsWith("^")) expect(await hashOf(page)).not.toBe(beforeHash);
  if (x.dialog) {
    const dialog = page.getByRole("dialog");
    await expect(dialog.first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  if (x.dialogClosed) await expect(page.getByRole("dialog")).toHaveCount(0);
  if (download) expect((await download).suggestedFilename()).toBeTruthy();
  if (chooser) await chooser;
  if (x.print) await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  if (x.theme) await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? "system")).not.toBe(beforeTheme);
  if (x.themeAny) await expect.poll(() => page.evaluate(() => localStorage.getItem("cadence-theme") ?? "system")).toMatch(/system|light|dark/);
  if (x.focusMain) await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("main");
  if (x.textChange) await expect.poll(() => page.locator("main").innerText()).not.toBe(beforeText);
  if (x.valueChange) await expect.poll(() => stateOf(el)).not.toBe(beforeState);
  if (x.href) expect(await el.getAttribute("href")).toMatch(new RegExp(String(x.href)));
}

async function prepare(page: Page, e: Entry) {
  await open(page, routeStart(e));
  for (const step of e.before ?? []) {
    if (step === "upload") await upload(page);
    else if (typeof step === "object") await page.getByRole(step.role as "button", { name: step.regex ? new RegExp(step.name) : step.name }).first().click();
  }
  if (e.route === "palette") await openPalette(page);
}

test.describe("controls manifest", () => {
  for (const [route, starts] of Object.entries(manifest.scans)) {
    for (const start of starts) {
      test(`every control on ${route} (${start}) is in the manifest`, async ({ page }) => {
        const errors = watchErrors(page);
        await open(page, start === "upload" ? `#/${route}` : start);
        if (start === "upload") await upload(page);
        if (route === "palette") await openPalette(page);
        const found = await controls(page, route === "palette");
        const scope = (route === "palette"
          ? manifest.controls.filter((e) => e.route === "palette")
          : manifest.controls.filter((e) => e.route === route || e.route === "*"));
        const missing = found.filter(([role, name]) => !scope.some((e) => e.role === role && matches(e, name)));
        expect(missing, "controls on the page that are not in controls.manifest.json").toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }

  // Entries for every route ("*") that apply to all instances are exercised on each route.
  const runs = manifest.controls.flatMap((e, i) => (e.route === "*" && e.all
    ? Object.keys(manifest.scans).filter((r) => r !== "palette").map((r) => ({ i, e: { ...e, start: `#/${r}`, optional: true }, where: r }))
    : [{ i, e, where: e.route }]));
  for (const { i, e, where } of runs) {
    test(`#${i} ${where} · ${e.role} "${e.name}": ${e.effect}`, async ({ page }) => {
      const errors = watchErrors(page);
      await prepare(page, e);
      const start = await hashOf(page);
      const locate = () => page.getByRole(e.role as "button", { name: nameOf(e), exact: !e.regex });
      const n = await locate().count();
      if (!e.optional) expect(n, `control ${e.role} "${e.name}" exists`).toBeGreaterThan(0);
      for (let k = 0; k < (e.all ? n : 1); k++) {
        if (k > 0 && (await hashOf(page)) !== start) await prepare(page, e);
        if (k > 0 && e.route === "palette") await prepare(page, e);
        await act(page, e, locate().nth(k));
      }
      expect(errors).toEqual([]);
    });
  }
});
