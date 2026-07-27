import { test, expect } from "@playwright/test";
import { connectFreighterWallet } from "./helpers/wallet";
import {
  MarketplaceTestStore,
  setupMarketplaceMocks,
  setupWalletIndexerMocks,
  resetE2eListingsInBrowser,
} from "./helpers/marketplace-mocks";

test.describe("Settings preferences (#481)", () => {
  const store = new MarketplaceTestStore();

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
    await resetE2eListingsInBrowser(page);
  });

  test("settings page loads preferences from backend on load", async ({
    page,
  }) => {
    await setupWalletIndexerMocks(page, {
      preferences: {
        theme: "dark",
        currency: "NGN",
        priceAlerts: false,
      },
    });

    const prefsRequest = page.waitForRequest(
      (req) =>
        req.method() === "GET" &&
        /\/wallets\/[^/]+\/preferences/.test(req.url()),
    );

    await connectFreighterWallet(page);
    await page.goto("/settings");
    await prefsRequest;

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-prefs-loaded="true"]')).toBeVisible({
      timeout: 15_000,
    });

    // Display Currency select reflects backend preference (NGN, not default XLM).
    const currencySelect = page
      .locator("select")
      .filter({ hasText: "Nigerian Naira" });
    await expect(currencySelect).toHaveValue("NGN");

    // Price Alerts toggle is off when backend returns priceAlerts: false.
    const priceAlertsRow = page
      .locator("div.flex.items-center.justify-between")
      .filter({ hasText: "Price Alerts" });
    await expect(priceAlertsRow.locator("button")).toHaveClass(/bg-gray-600/);
  });
});
