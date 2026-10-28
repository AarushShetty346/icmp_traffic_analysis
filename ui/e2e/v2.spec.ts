import { expect, test } from "@playwright/test";
import { open, watchErrors } from "./helpers";

test("the guided case teaches the timing idea and reveals both case files", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, "#/case");
  await expect(page.getByRole("heading", { name: /hidden messages in ping timing/i })).toBeVisible();
  await page.getByRole("textbox", { name: "Your short note" }).fill("A");
  await expect(page.getByText("8 bits", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Start the investigation/ }).click();
  await expect(page.getByRole("heading", { name: "Follow the timing clue." })).toBeVisible();
  await expect(page.getByRole("img", { name: /Arrival gap chart/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Network delay variation" }).selectOption("jitter 100 ms");
  await page.getByRole("combobox", { name: "How subtle is the hidden timing?" }).selectOption("0.98/1.02 s");
  await expect(page.getByRole("img", { name: /Arrival gap chart/ })).toBeVisible();
  await page.getByRole("button", { name: "Case file B" }).click();
  await page.getByRole("button", { name: "Ordinary pings" }).click();
  await expect(page.getByRole("status")).toContainText("Good call");
  await expect(page.getByRole("status")).toContainText("ordinary traffic");
  expect(errors).toEqual([]);
});

test("guardian rates and paced relay respond to controls", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, "#/case?step=2");
  await expect(page.getByRole("heading", { name: "Detection and its trade-offs" })).toBeVisible();
  await expect(page.getByText("MESSAGES CAUGHT", { exact: true })).toBeVisible();
  await expect(page.locator(".verdict-map-row").first().locator('[role="img"]')).toHaveCount(10);
  await expect(page.locator(".verdict-map-row").nth(1).locator('[role="img"]')).toHaveCount(10);
  const explanation = page.locator(".case-explanation");
  await page.getByRole("button", { name: /Fixed limit/ }).click();
  await expect(explanation).toContainText("100 ms");
  await page.getByRole("button", { name: /Clean-only baseline/ }).click();
  await expect(explanation).toContainText("clean normal runs");
  await expect(page.locator(".guardian-result").nth(2)).toContainText("100%");
  await expect(page.locator(".pace-stats")).toContainText("Extra wait for ordinary pings");
  await page.locator("#pace-buffer").focus();
  await page.keyboard.press("End");
  await expect(page.getByText("Initial waiting room: 1000 ms")).toBeVisible();
  expect(errors).toEqual([]);
});

test("locked message really encrypts, unlocks, and rejects a wrong key or damaged bits", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, "#/case?step=3");
  await page.getByRole("button", { name: /Lock this note/ }).click();
  await expect(page.locator(".crypto-success")).toContainText("HI", { timeout: 15_000 });
  await expect(page.locator(".crypto-guardian")).toContainText("timing chunks flagged");
  await expect(page.getByText(/Estimated time/)).toBeVisible();
  await page.getByRole("button", { name: "Try a wrong key" }).click();
  await expect(page.locator(".crypto-failure")).toContainText("Could not unlock", { timeout: 15_000 });
  await page.getByLabel("Receiver key phrase").fill("cadence-demo-key");
  await expect(page.locator(".crypto-success")).toContainText("HI", { timeout: 15_000 });
  await page.getByRole("combobox", { name: "Network delay variation" }).selectOption("50");
  await expect(page.locator(".crypto-failure")).toContainText("Could not unlock", { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("advanced tools remain reachable, the guide translates terms, and mobile does not overflow", async ({ page }, info) => {
  const errors = watchErrors(page);
  await open(page, "#/lab");
  await expect(page.getByRole("heading", { name: /Go deeper/ })).toBeVisible();
  await page.getByRole("link", { name: /The signal/ }).click();
  await expect(page.getByRole("heading", { name: "Signal", exact: true })).toBeVisible();
  await page.goto("/#/guide");
  await page.getByRole("searchbox", { name: "Find a word" }).fill("jitter");
  await expect(page.getByRole("heading", { name: "Jitter" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Standard deviation (std)" })).toHaveCount(0);
  if (info.project.name === "mobile-390") {
    for (const hash of ["#/case", "#/case?step=1", "#/case?step=2", "#/case?step=3", "#/lab", "#/guide"]) {
      await page.goto(`/${hash}`);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${hash} should fit the viewport` }).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("an unmarked CSV remains unverified until its source is explicitly chosen", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, "#/runs");
  await page.locator('input[type="file"]').setInputFiles({ name: "normal_trial.csv", mimeType: "text/csv", buffer: Buffer.from("frame.time_epoch,icmp.seq\n10,1\n11,2\n12,3\n") });
  const source = page.getByRole("combobox", { name: "Provenance of normal_trial.csv" });
  await expect(source).toHaveValue("unverified");
  await expect(page.getByRole("note", { name: "Data source" })).toContainText("UNVERIFIED FILES");
  await source.selectOption("capture");
  await expect(page.getByRole("note", { name: "Data source" })).not.toContainText("UNVERIFIED FILES");
  await page.goto("/#/evidence");
  await expect(page.getByText("REAL-CAPTURE LABELS")).toBeVisible();
  await expect(page.locator(".evidence-counts>div").nth(1)).toContainText("1");
  expect(errors).toEqual([]);
});

test("sample CSVs load as simulated files with roles that Detectors can use", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, "#/runs");
  await page.getByRole("button", { name: "Load sample CSVs" }).click();
  const names = ["sample_simulated_baseline_normal.csv", "sample_simulated_test_normal.csv", "sample_simulated_test_covert.csv"];
  for (const name of names) await expect(page.getByRole("combobox", { name: `Provenance of ${name}` })).toHaveValue("simulated");
  await expect(page.getByRole("combobox", { name: `Use of ${names[0]}` })).toHaveValue("baseline-matched");
  await expect(page.getByRole("combobox", { name: `Use of ${names[1]}` })).toHaveValue("test");
  await expect(page.getByRole("combobox", { name: `Use of ${names[2]}` })).toHaveValue("test");
  await expect(page.getByRole("combobox", { name: `Label of ${names[1]}` })).toHaveValue("normal");
  await expect(page.getByRole("combobox", { name: `Label of ${names[2]}` })).toHaveValue("covert");
  await expect(page.getByText("Showing 3 of 3 runs.")).toBeVisible();
  await page.getByRole("button", { name: "Check them in Detectors" }).click();
  await expect(page).toHaveURL(/#\/detectors\?src=uploads/);
  await expect(page.locator("#settings")).toContainText("1 baseline, 1 normal test and 1 covert test file");
  await expect(page.getByRole("button", { name: "Advanced options" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Baseline: detection rate")).toBeVisible();
  await expect(page.locator("#rulings")).toContainText(/simulated/i);
  await expect(page.getByRole("note", { name: "Data source" })).toContainText("DEMO DATA");
  expect(errors).toEqual([]);
});

test("Detectors and Stress show the main choices first and keep the rest under advanced controls", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, "#/detectors");
  for (const label of ["Network variation", "Message subtlety"]) await expect(page.getByRole("combobox", { name: label })).toBeVisible();
  await expect(page.getByText("Learn normal from")).toBeVisible();
  await expect(page.getByText(/catches.*hidden message/)).toBeVisible();
  await expect(page.getByRole("slider", { name: "Window size" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show roc curve" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Show which feature separates best" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Advanced options" }).click();
  await expect(page.getByRole("slider", { name: "Window size" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Delay model" })).toBeVisible();
  await page.getByRole("button", { name: "Show roc curve" }).click();
  await expect(page.getByRole("combobox", { name: "Feature" })).toBeVisible();

  await page.goto("/#/stress");
  await expect(page.getByRole("combobox", { name: "Metric" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Detector" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Delay model" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "How to read the grid" })).toBeVisible();
  await expect(page.locator("#read-grid-title").locator("..")).toContainText("dark is good");
  await page.getByRole("combobox", { name: "Metric" }).selectOption("fpr");
  await expect(page.locator("#read-grid-title").locator("..")).toContainText("dark is bad");
  await page.getByRole("button", { name: "Advanced filters" }).click();
  await expect(page.getByRole("combobox", { name: "Delay model" })).toBeVisible();
  expect(errors).toEqual([]);
});
