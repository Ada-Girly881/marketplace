import { test, expect } from "@playwright/test";
import { TEST_PUBLIC_KEY, BUYER_PUBLIC_KEY } from "./freighter-mock";
import { connectFreighterWallet } from "./helpers/wallet";
import {
  E2E_METADATA_CID,
  MarketplaceTestStore,
  MOCK_ARTWORK_METADATA,
  setupMarketplaceMocks,
  setupWalletIndexerMocks,
  resetE2eListingsInBrowser,
} from "./helpers/marketplace-mocks";

const DEFAULT_TOKEN =
  process.env.NEXT_PUBLIC_NATIVE_TOKEN_CONTRACT_ID ??
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

test.describe("Profile past sales history (#480)", () => {
  const store = new MarketplaceTestStore();

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
    await setupWalletIndexerMocks(page);
    await resetE2eListingsInBrowser(page);
  });

  test("profile page displays user past sales history", async ({ page }) => {
    store.upsertActive({
      listing_id: 4801,
      artist: TEST_PUBLIC_KEY,
      metadata_cid: E2E_METADATA_CID,
      price: String(42 * 10_000_000),
      currency: "XLM",
      token: DEFAULT_TOKEN,
      status: "Sold",
      owner: BUYER_PUBLIC_KEY,
      created_at: Math.floor(Date.now() / 1000),
      original_creator: TEST_PUBLIC_KEY,
      royalty_bps: 500,
      recipients: [{ address: TEST_PUBLIC_KEY, percentage: 100 }],
    });

    const artistListingsRequest = page.waitForRequest(
      (req) =>
        req.method() === "GET" &&
        req.url().includes("/listings") &&
        req.url().includes(`artist=${encodeURIComponent(TEST_PUBLIC_KEY)}`),
    );

    await connectFreighterWallet(page, TEST_PUBLIC_KEY);
    await page.goto("/profile");
    await artistListingsRequest;

    await expect(page.getByText("African")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /heritage sold/i }).click();

    await expect(page.getByText(MOCK_ARTWORK_METADATA.title)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Sold").first()).toBeVisible();
    await expect(page.getByText("42 XLM")).toBeVisible();
  });
});
