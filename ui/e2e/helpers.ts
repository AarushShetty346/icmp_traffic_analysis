import { expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = ["normal_r01.csv", "normal_r02.csv", "covert_r01.csv"].map((f) => path.join(here, "fixtures", f));

/** Collect console errors and page errors; tests assert the list is empty at the end. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

export async function open(page: Page, hash: string) {
  await page.goto(`/${hash}`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.getByRole("status", { name: /Loading/ })).toHaveCount(0, { timeout: 15_000 });
}

export async function upload(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURES);
  await expect(page.getByRole("button", { name: "Remove covert_r01.csv" })).toBeVisible();
}

export const ROLE_LINE = /^\s*- '?(button|link|combobox|slider|checkbox|radio|switch|textbox|searchbox|spinbutton|menuitem|tab|option)(?: "((?:[^"\\]|\\.)*)")?(?=[\s:'[]|$)/;

/** Interactive controls on the page as [role, accessible name], from the accessibility tree. */
export async function controls(page: Page, withOptions: boolean): Promise<[string, string][]> {
  const snap = await page.locator("body").ariaSnapshot();
  const out: [string, string][] = [];
  for (const line of snap.split("\n")) {
    const m = line.match(ROLE_LINE);
    if (!m) continue;
    if (m[1] === "option" && !withOptions) continue;
    out.push([m[1], (m[2] ?? "").replace(/\\"/g, '"')]);
  }
  return out;
}
