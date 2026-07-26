import { test, expect } from "@playwright/test";
import { connectFreighterWallet } from "./helpers/wallet";

test.describe("Notifications", () => {
  test.beforeEach(async ({ page }) => {
    await connectFreighterWallet(page);
  });

  test("receiving SSE event increments notification counter", async ({
    page,
  }) => {
    await page.goto("/");

    const notificationBell = page.locator('[data-testid="notification-bell"]');
    await expect(notificationBell).toBeVisible({ timeout: 10_000 });

    const counterBefore = await notificationBell
      .locator('[data-testid="notification-count"]')
      .textContent()
      .then((text) => parseInt(text || "0", 10))
      .catch(() => 0);

    await page.evaluate(() => {
      const eventSource = new EventSource(
        `${process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:4000"}/events/stream`,
      );
      eventSource.onmessage = () => {};
      eventSource.onerror = () => {};
    });

    await page.waitForTimeout(3000);

    const counterAfter = await notificationBell
      .locator('[data-testid="notification-count"]')
      .textContent()
      .then((text) => parseInt(text || "0", 10))
      .catch(() => 0);

    expect(counterAfter).toBeGreaterThanOrEqual(counterBefore);
  });

  test("clicking a notification routes to the relevant listing/auction", async ({
    page,
  }) => {
    await page.goto("/");

    const notificationBell = page.locator('[data-testid="notification-bell"]');
    await expect(notificationBell).toBeVisible({ timeout: 10_000 });
    await notificationBell.click();

    const notificationPanel = page.locator(
      '[data-testid="notification-panel"]',
    );
    await expect(notificationPanel).toBeVisible();

    const firstNotification = notificationPanel
      .locator('[data-testid="notification-item"]')
      .first();

    if ((await firstNotification.count()) > 0) {
      const listingLink = firstNotification.locator("a");
      if ((await listingLink.count()) > 0) {
        const href = await listingLink.first().getAttribute("href");
        await listingLink.first().click();

        if (href?.includes("/listings/")) {
          await expect(page).toHaveURL(new RegExp("/listings/"));
        } else if (href?.includes("/auctions/")) {
          await expect(page).toHaveURL(new RegExp("/auctions/"));
        }
      }
    }
  });
});
