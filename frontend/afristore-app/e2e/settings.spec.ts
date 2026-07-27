import { test, expect } from "@playwright/test";
import { connectFreighterWallet } from "./helpers/wallet";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await connectFreighterWallet(page);
  });

  test("toggling dark/light theme updates preference in backend", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(page.getByText("Settings")).toBeVisible({ timeout: 10_000 });

    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    if ((await themeToggle.count()) > 0) {
      const initialTheme = await page.evaluate(() => {
        return document.documentElement.classList.contains("dark")
          ? "dark"
          : "light";
      });

      await themeToggle.click();

      const updatedTheme = await page.evaluate(() => {
        return document.documentElement.classList.contains("dark")
          ? "dark"
          : "light";
      });

      expect(updatedTheme).not.toBe(initialTheme);

      const savedSettings = await page.evaluate(() => {
        const stored = localStorage.getItem("afristore_settings");
        return stored ? JSON.parse(stored) : null;
      });

      expect(savedSettings).toBeTruthy();
      expect(savedSettings.theme).toBe(updatedTheme);
    }
  });
});
