import { test, expect } from "@playwright/test";
import { BUYER_PUBLIC_KEY, TEST_PUBLIC_KEY } from "./freighter-mock";
import {
  E2E_METADATA_CID,
  MarketplaceTestStore,
  setupMarketplaceMocks,
  resetE2eListingsInBrowser,
  seedE2eAuctionInBrowser,
} from "./helpers/marketplace-mocks";
import { connectFreighterWallet } from "./helpers/wallet";

const DEFAULT_TOKEN =
  process.env.NEXT_PUBLIC_NATIVE_TOKEN_CONTRACT_ID ??
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

test.describe("Auctions Lifecycle E2E", () => {
  const store = new MarketplaceTestStore();

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
  });

  test("auction finalize button appears for creator after countdown ends", async ({
    page,
  }) => {
    await connectFreighterWallet(page, TEST_PUBLIC_KEY);
    await resetE2eListingsInBrowser(page);

    const expiredTime = Math.floor(Date.now() / 1000) - 100;
    await seedE2eAuctionInBrowser(page, {
      auction_id: 8001,
      creator: TEST_PUBLIC_KEY,
      metadata_cid: E2E_METADATA_CID,
      collection: "CA1234567890",
      token_id: 1,
      token: DEFAULT_TOKEN,
      reserve_price: 100_000_000n, // 10 XLM
      highest_bid: 150_000_000n, // 15 XLM
      highest_bidder: BUYER_PUBLIC_KEY,
      end_time: expiredTime,
      status: "Active",
      recipients: [{ address: TEST_PUBLIC_KEY, percentage: 100 }],
      created_at: Math.floor(Date.now() / 1000) - 3600,
    });

    await page.goto("/auctions/8001");
    await expect(page.getByText("Auction Ended")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /finalize auction/i }),
    ).toBeVisible();
  });

  test("finalize transaction transfers NFT to highest bidder", async ({
    page,
  }) => {
    await connectFreighterWallet(page, TEST_PUBLIC_KEY);
    await resetE2eListingsInBrowser(page);

    const expiredTime = Math.floor(Date.now() / 1000) - 100;
    await seedE2eAuctionInBrowser(page, {
      auction_id: 8002,
      creator: TEST_PUBLIC_KEY,
      metadata_cid: E2E_METADATA_CID,
      collection: "CA1234567890",
      token_id: 2,
      token: DEFAULT_TOKEN,
      reserve_price: 100_000_000n,
      highest_bid: 200_000_000n,
      highest_bidder: BUYER_PUBLIC_KEY,
      end_time: expiredTime,
      status: "Active",
      recipients: [{ address: TEST_PUBLIC_KEY, percentage: 100 }],
      created_at: Math.floor(Date.now() / 1000) - 3600,
    });

    await page.goto("/auctions/8002");
    await expect(page.getByText("Auction Ended")).toBeVisible({ timeout: 15_000 });

    const finalizeBtn = page.getByRole("button", { name: /finalize auction/i });
    await expect(finalizeBtn).toBeVisible();
    await finalizeBtn.click();

    await expect(
      page.getByText(/auction finalized successfully|won by/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
