import { test, expect } from "@playwright/test";
import { connectFreighterWallet, openNewListingTab } from "./helpers/wallet";
import {
  MarketplaceTestStore,
  setupMarketplaceMocks,
  setupWalletIndexerMocks,
  resetE2eListingsInBrowser,
} from "./helpers/marketplace-mocks";

test.describe("Dashboard empty state (#477)", () => {
  const store = new MarketplaceTestStore();

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
    // User owns 0 NFTs — tokens endpoint returns an empty array.
    await setupWalletIndexerMocks(page, { tokens: [] });
    await resetE2eListingsInBrowser(page);
    await connectFreighterWallet(page);
  });

  test("dashboard handles empty state when user owns 0 NFTs", async ({
    page,
  }) => {
    const tokensRequest = page.waitForRequest(
      (req) =>
        req.method() === "GET" &&
        /\/wallets\/[^/]+\/tokens/.test(req.url()),
    );

    await openNewListingTab(page);
    await tokensRequest;

    await expect(
      page.getByText("No NFTs found in your wallet"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/don't own any NFTs on this network/i),
    ).toBeVisible();
  });
});
