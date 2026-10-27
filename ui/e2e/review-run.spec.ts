import { expect, test } from "@playwright/test";
import { open, watchErrors } from "./helpers";

test("one-browser review route reaches every segment and both handoffs", async ({ page }) => {
  const errors = watchErrors(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });

  await open(page, "#/case");
  await expect(page.getByText("610 simulated recordings")).toBeVisible();
  await nav.getByRole("link", { name: "Runs" }).click();
  await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Signal" }).click();
  await expect(page.getByRole("heading", { name: "Signal", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Guided case" }).click();
  await page.getByRole("button", { name: "Chapter 2: Detective" }).click();
  await page.getByRole("button", { name: "A hidden message" }).click();
  await expect(page.getByRole("status")).toContainText("deliberately hidden message");
  await page.getByRole("button", { name: /Continue: Guardian/ }).click();

  await expect(page.getByRole("heading", { name: "Detection and its trade-offs" })).toBeVisible();
  await page.getByRole("button", { name: /Fixed limit/ }).click();
  await page.getByRole("button", { name: /Clean-only baseline/ }).click();
  await page.getByRole("button", { name: /Same conditions/ }).click();
  await expect(page.locator(".pace-stats")).toContainText("Extra wait for ordinary pings");
  await nav.getByRole("link", { name: "Detectors" }).click();
  await expect(page.getByRole("heading", { name: "Detectors", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Stress matrix" }).click();
  await expect(page.getByRole("heading", { name: "Stress matrix", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Guided case" }).click();
  await page.getByRole("button", { name: "Chapter 4: Locked note" }).click();

  await page.getByRole("button", { name: /Lock this note/ }).click();
  await expect(page.locator(".crypto-success")).toContainText("HI", { timeout: 15_000 });
  await page.getByRole("button", { name: "Try a wrong key" }).click();
  await expect(page.locator(".crypto-failure")).toContainText("Could not unlock", { timeout: 15_000 });
  await nav.getByRole("link", { name: "Decode" }).click();
  await expect(page.getByRole("heading", { name: "Decode", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Guide", exact: true }).click();
  await page.getByRole("searchbox", { name: "Find a word" }).fill("jitter");
  await expect(page.getByRole("heading", { name: "Jitter" })).toBeVisible();
  await nav.getByRole("link", { name: "Guided case" }).click();
  await page.getByRole("button", { name: "Chapter 5: Case closed" }).click();
  await page.getByRole("link", { name: /Inspect evidence and limits/ }).click();
  await expect(page.getByRole("heading", { name: "What do we actually know?" })).toBeVisible();
  await expect(page.locator(".evidence-counts>div").first()).toContainText("610");
  expect(errors).toEqual([]);
});
