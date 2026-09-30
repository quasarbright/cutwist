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

test("the about modal's diagrams run", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: "about", exact: true }).click();
  // each diagram fills in its caption from its animation loop once it's on screen
  for (const kind of ["carve-sphere", "carve-box", "cuts", "turn", "symcuts", "drift", "table"]) {
    await page.locator(`.cohesion-about [data-viz="${kind}"]`).scrollIntoViewIfNeeded();
    await expect(page.locator(`.cohesion-about [data-caption="${kind}"]`)).not.toHaveText(/^\s*$/);
  }
  // closed and opened again, the same (kept) diagrams draw into the new copy
  await page.locator(".cohesion-modal-close").click();
  await page.getByRole("button", { name: "about", exact: true }).click();
  await expect(page.locator('.cohesion-about [data-caption="carve-sphere"]')).not.toHaveText(/^\s*$/);
  await noErrors(errors);
});

test("without WebGL the page says so and how to turn it on", async ({ page }) => {
  // (as with graphics acceleration off: the browser hands back no WebGL context)
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/.test(type) ? null : get.call(this, type, ...rest);
    };
  });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#nogl")).toBeVisible();
  await expect(page.locator("#nogl")).toContainText("graphics acceleration");
});
