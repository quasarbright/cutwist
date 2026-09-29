import { test, expect } from "@playwright/test";
import { open, info, noErrors } from "./helpers.mjs";

test("the page loads a 3×3×3 cube with no errors", async ({ page }) => {
  const errors = await open(page);
  const s = await info(page);
  expect(s.title).toBe("3×3×3 cube");
  expect(s.pieces).toBe(27);
  expect(s.solved).toBe(true);
  await noErrors(errors);
});
