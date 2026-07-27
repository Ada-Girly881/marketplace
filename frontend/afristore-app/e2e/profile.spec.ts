import { test, expect, Page } from "@playwright/test";
import { connectFreighterWallet } from "./helpers/wallet";
import { TEST_PUBLIC_KEY } from "./freighter-mock";

const INDEXER_URL = (
  process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

async function mockProfileIndexer(page: Page) {
  await page.route(`${INDEXER_URL}/wallets/${TEST_PUBLIC_KEY}/activity**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 101,
          listingId: "42",
          eventType: "ARTWORK_SOLD",
          actor: TEST_PUBLIC_KEY,
          data: {
            artist: TEST_PUBLIC_KEY,
            buyer: "GBUYERWALLET000000000000000000000000000000000000000000000",
            price: "88.5",
          },
          ledgerSequence: 123456,
          ledgerTimestamp: "2026-07-20T10:30:00.000Z",
        },
      ]),
    });
  });

  await page.route(`${INDEXER_URL}/wallets/${TEST_PUBLIC_KEY}/royalty-stats`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalEarned: "27.75",
        payoutCount: 3,
        lastPayout: 1784543400000,
      }),
    });
  });

  await page.route(`${INDEXER_URL}/listings**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ listings: [], total: 0 }),
    });
  });
}

test.describe("Profile", () => {
  test("profile page displays correct royalty statistics", async ({ page }) => {
    await mockProfileIndexer(page);
    await connectFreighterWallet(page);

    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: /african patron/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Creator Royalties")).toBeVisible();
    await expect(page.getByText("27.75")).toBeVisible();
    await expect(page.getByText("XLM")).toBeVisible();
    await expect(page.getByText(/3\s+Payouts Found/i)).toBeVisible();
  });
});
