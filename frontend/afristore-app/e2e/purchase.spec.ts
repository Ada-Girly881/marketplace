import { test, expect } from "@playwright/test";
import { BUYER_PUBLIC_KEY, TEST_PUBLIC_KEY } from "./freighter-mock";
import {
  E2E_METADATA_CID,
  MarketplaceTestStore,
  MOCK_ARTWORK_METADATA,
  setupMarketplaceMocks,
  resetE2eListingsInBrowser,
} from "./helpers/marketplace-mocks";
import { connectFreighterWallet } from "./helpers/wallet";

const DEFAULT_TOKEN =
  process.env.NEXT_PUBLIC_NATIVE_TOKEN_CONTRACT_ID ??
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

test.describe("Buy Now button triggers Freighter transaction for full amount (#508)", () => {
  const store = new MarketplaceTestStore();

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
    await resetE2eListingsInBrowser(page);
  });

  test("checkout charges the full listing price, not a partial deposit", async ({
    page,
  }) => {
    store.upsertActive({
      listing_id: 9801,
      artist: TEST_PUBLIC_KEY,
      metadata_cid: E2E_METADATA_CID,
      price: String(40 * 10_000_000),
      currency: "XLM",
      token: DEFAULT_TOKEN,
      status: "Active",
      owner: null,
      created_at: Math.floor(Date.now() / 1000),
      original_creator: TEST_PUBLIC_KEY,
      royalty_bps: 0,
      recipients: [{ address: TEST_PUBLIC_KEY, percentage: 100 }],
    });

    await connectFreighterWallet(page, BUYER_PUBLIC_KEY);
    await page.goto("/explore");
    await expect(page.getByText(MOCK_ARTWORK_METADATA.title)).toBeVisible();

    await page.getByRole("button", { name: /buy now/i }).first().click();
    await expect(page.getByText("Checkout")).toBeVisible();

    // Unit price and total price both reflect the full listing price —
    // there is no partial/deposit amount at quantity 1.
    await expect(page.getByText("40 XLM").first()).toBeVisible();
    const payButton = page.getByRole("button", { name: /pay 40 xlm/i });
    await expect(payButton).toBeVisible();

    await payButton.click();
    await expect(page.getByText("Checkout")).toBeHidden({ timeout: 15_000 });

    store.markSold(9801, BUYER_PUBLIC_KEY);
    await page.reload();
    await expect(page.getByRole("button", { name: /buy now/i })).toHaveCount(
      0,
    );
  });

  test("increasing quantity scales the Freighter payment to the new full total", async ({
    page,
  }) => {
    store.upsertActive({
      listing_id: 9802,
      artist: TEST_PUBLIC_KEY,
      metadata_cid: E2E_METADATA_CID,
      price: String(12 * 10_000_000),
      currency: "XLM",
      token: DEFAULT_TOKEN,
      status: "Active",
      owner: null,
      created_at: Math.floor(Date.now() / 1000),
      original_creator: TEST_PUBLIC_KEY,
      royalty_bps: 0,
      recipients: [{ address: TEST_PUBLIC_KEY, percentage: 100 }],
    });

    await connectFreighterWallet(page, BUYER_PUBLIC_KEY);
    await page.goto("/explore");
    await page.getByRole("button", { name: /buy now/i }).first().click();
    await expect(page.getByText("Checkout")).toBeVisible();

    await expect(
      page.getByRole("button", { name: /pay 12 xlm/i }),
    ).toBeVisible();

    // Bump quantity to 3 — the pay button must charge the full 3x total,
    // never a fixed per-unit or partial amount.
    await page.getByRole("button", { name: "+" }).click();
    await page.getByRole("button", { name: "+" }).click();

    await expect(
      page.getByRole("button", { name: /pay 36 xlm/i }),
    ).toBeVisible();
  });
});
