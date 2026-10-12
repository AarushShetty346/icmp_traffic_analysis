import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("a typed UTF-8 message follows the ideal timing example and round trips", async ({ page }) => {
  await open(page, "#/decode");
  const demo = page.locator("#own-message");
  const message = demo.getByRole("textbox", { name: "Message to encode" });
  const values = demo.locator("dd");

  await message.fill("A");
  await expect(values.nth(0)).toHaveText("01000001");
  await expect(values.nth(1)).toContainText("0.75 · 1.25");
  await expect(values.nth(2)).toHaveText("01000001");
  await expect(values.nth(3)).toHaveText("A");

  await message.fill("é");
  await expect(values.nth(0)).toHaveText("1100001110101001");
  await expect(values.nth(3)).toHaveText("é");

  await message.fill("x".repeat(33));
  await expect(message).toHaveAttribute("aria-invalid", "true");
  await expect(demo.getByText("Use at most 32 UTF-8 bytes; this message has 33.")).toBeVisible();
  await expect(values).toHaveCount(0);
});
