import { test, expect, Page } from "@playwright/test";
import { TEST_PUBLIC_KEY, BUYER_PUBLIC_KEY } from "./freighter-mock";
import {
  E2E_IMAGE_CID,
  MarketplaceTestStore,
  MOCK_ARTWORK_METADATA,
  setupMarketplaceMocks,
  resetE2eListingsInBrowser,
  E2eIndexerListing,
} from "./helpers/marketplace-mocks";

const INDEXER_URL = (
  process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

const DEFAULT_TOKEN =
  process.env.NEXT_PUBLIC_NATIVE_TOKEN_CONTRACT_ID ??
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

// Explore page paginates at 12 items per page (see PAGE_SIZE in app/explore/page.tsx).
const PAGE_SIZE = 12;

const CID_BAOBAB = "QmE2eBaobabTwilightCid";
const CID_LAGOS = "QmE2eLagosSkylineCid";
const CID_NAIROBI = "QmE2eNairobiStreetsCid";

const EXTRA_METADATA: Record<string, typeof MOCK_ARTWORK_METADATA> = {
  [CID_BAOBAB]: {
    ...MOCK_ARTWORK_METADATA,
    title: "Baobab Twilight",
    category: "Sculpture",
  },
  [CID_LAGOS]: {
    ...MOCK_ARTWORK_METADATA,
    title: "Lagos Skyline",
    category: "Painting",
  },
  [CID_NAIROBI]: {
    ...MOCK_ARTWORK_METADATA,
    title: "Nairobi Streets",
    category: "Photography",
  },
};

/** Serves distinct per-CID metadata for listings created with the CIDs above. */
async function mockExtraArtworkMetadata(page: Page) {
  await page.route("**/gateway.pinata.cloud/ipfs/**", async (route) => {
    const cid = route.request().url().split("/ipfs/").pop() ?? "";
    const meta = EXTRA_METADATA[cid];
    if (!meta) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(meta),
    });
  });
  await page.route("**/ipfs.io/ipfs/**", async (route) => {
    const cid = route.request().url().split("/ipfs/").pop() ?? "";
    const meta = EXTRA_METADATA[cid];
    if (!meta) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(meta),
    });
  });
}

/**
 * Mirrors the indexer's real `search` behaviour (matches against artist
 * address / collection — see indexer/src/api/routes.ts). Falls back to the
 * base marketplace mock for requests without a `search` param.
 */
async function mockIndexerSearch(page: Page, store: MarketplaceTestStore) {
  await page.route(`${INDEXER_URL}/listings**`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const search = url.searchParams.get("search");
    if (!search) return route.fallback();
    const q = search.toLowerCase();
    const rows = store.listings.filter((l) =>
      l.artist.toLowerCase().includes(q),
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ listings: rows, total: rows.length }),
    });
  });
}

function makeListing(
  overrides: Partial<E2eIndexerListing> & { listing_id: number },
): E2eIndexerListing {
  return {
    artist: TEST_PUBLIC_KEY,
    metadata_cid: CID_LAGOS,
    price: String(10 * 10_000_000),
    currency: "XLM",
    token: DEFAULT_TOKEN,
    status: "Active",
    owner: null,
    created_at: Math.floor(Date.now() / 1000),
    original_creator: TEST_PUBLIC_KEY,
    royalty_bps: 0,
    recipients: [{ address: TEST_PUBLIC_KEY, percentage: 100 }],
    ...overrides,
  };
}

function waitForListingsRequest(page: Page) {
  return page.waitForRequest(
    (req) => req.method() === "GET" && req.url().includes(`${INDEXER_URL}/listings`),
  );
}

test.describe("Explore page loads first page of listings (#491)", () => {
  const store = new MarketplaceTestStore();

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
    await resetE2eListingsInBrowser(page);
  });

  test("explore page loads first page of listings", async ({ page }) => {
    for (let i = 0; i < 14; i++) {
      store.upsertActive(
        makeListing({
          listing_id: 9200 + i,
          metadata_cid: `${CID_LAGOS}-${i}`,
          created_at: Math.floor(Date.now() / 1000) + i,
        }),
      );
    }

    const listingsRequest = waitForListingsRequest(page);
    await page.goto("/explore");
    await listingsRequest;

    await expect(page.getByText("Explore Artworks")).toBeVisible();
    await expect(
      page.getByText(/Showing\s+1\s*-\s*12\s+of\s+14\s+artworks/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /buy now/i })).toHaveCount(
      PAGE_SIZE,
    );

    // Pagination controls reflect two total pages.
    await expect(
      page.getByRole("button", { name: "2", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(
      page.getByText(/Showing\s+13\s*-\s*14\s+of\s+14\s+artworks/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /buy now/i })).toHaveCount(
      2,
    );
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });
});

test.describe("Explore page sorts by Price (#494)", () => {
  const store = new MarketplaceTestStore();

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
    await mockExtraArtworkMetadata(page);
    await resetE2eListingsInBrowser(page);

    const now = Math.floor(Date.now() / 1000);
    // created_at order (oldest → newest) intentionally differs from price
    // order so switching sort mode visibly reorders the grid.
    store.upsertActive(
      makeListing({
        listing_id: 9301,
        metadata_cid: CID_BAOBAB,
        price: String(5 * 10_000_000),
        created_at: now,
      }),
    );
    store.upsertActive(
      makeListing({
        listing_id: 9302,
        metadata_cid: CID_LAGOS,
        price: String(25 * 10_000_000),
        created_at: now + 1,
      }),
    );
    store.upsertActive(
      makeListing({
        listing_id: 9303,
        metadata_cid: CID_NAIROBI,
        price: String(15 * 10_000_000),
        created_at: now + 2,
      }),
    );
  });

  test("sorts listings ascending and descending by price", async ({
    page,
  }) => {
    const listingsRequest = waitForListingsRequest(page);
    await page.goto("/explore");
    await listingsRequest;

    await expect(page.getByText("Nairobi Streets")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("h3")).toHaveText([
      "Nairobi Streets",
      "Lagos Skyline",
      "Baobab Twilight",
    ]);

    await page.getByRole("combobox").first().selectOption("price-low");
    await expect(page.locator("h3")).toHaveText([
      "Baobab Twilight",
      "Nairobi Streets",
      "Lagos Skyline",
    ]);

    await page.getByRole("combobox").first().selectOption("price-high");
    await expect(page.locator("h3")).toHaveText([
      "Lagos Skyline",
      "Nairobi Streets",
      "Baobab Twilight",
    ]);
  });
});

test.describe("Explore page filters by category/kind (#495)", () => {
  const store = new MarketplaceTestStore();

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
    await mockExtraArtworkMetadata(page);
    await resetE2eListingsInBrowser(page);

    store.upsertActive(
      makeListing({ listing_id: 9401, metadata_cid: CID_BAOBAB }),
    );
    store.upsertActive(
      makeListing({ listing_id: 9402, metadata_cid: CID_LAGOS }),
    );
    store.upsertActive(
      makeListing({ listing_id: 9403, metadata_cid: CID_NAIROBI }),
    );
  });

  test("filters the grid down to the selected category", async ({
    page,
  }) => {
    const listingsRequest = waitForListingsRequest(page);
    await page.goto("/explore");
    await listingsRequest;

    await expect(page.getByText("Baobab Twilight")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Lagos Skyline")).toBeVisible();
    await expect(page.getByText("Nairobi Streets")).toBeVisible();

    await page.getByRole("button", { name: /advanced filters/i }).click();
    await page.getByRole("combobox").nth(1).selectOption("Sculpture");

    await expect(page.getByText("Baobab Twilight")).toBeVisible();
    await expect(page.getByText("Lagos Skyline")).toHaveCount(0);
    await expect(page.getByText("Nairobi Streets")).toHaveCount(0);
    await expect(
      page.getByText(/Found\s+1\s+results\s+matching\s+your\s+criteria/i),
    ).toBeVisible();

    await page.getByRole("combobox").nth(1).selectOption("All");

    await expect(page.getByText("Lagos Skyline")).toBeVisible();
    await expect(page.getByText("Nairobi Streets")).toBeVisible();
  });
});

test.describe("Search bar returns relevant collection/NFT results (#496)", () => {
  const store = new MarketplaceTestStore();

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
    await mockExtraArtworkMetadata(page);
    await mockIndexerSearch(page, store);
    await resetE2eListingsInBrowser(page);

    store.upsertActive(
      makeListing({
        listing_id: 9501,
        artist: TEST_PUBLIC_KEY,
        metadata_cid: CID_LAGOS,
      }),
    );
    store.upsertActive(
      makeListing({
        listing_id: 9502,
        artist: BUYER_PUBLIC_KEY,
        metadata_cid: CID_BAOBAB,
      }),
    );
  });

  test("search bar returns only listings matching the query", async ({
    page,
  }) => {
    const listingsRequest = waitForListingsRequest(page);
    await page.goto("/explore");
    await listingsRequest;

    await expect(page.getByText("Lagos Skyline")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Baobab Twilight")).toBeVisible();

    const query = TEST_PUBLIC_KEY.slice(0, 10);
    const searchRequest = page.waitForRequest(
      (req) =>
        req.method() === "GET" &&
        req.url().includes(`${INDEXER_URL}/listings`) &&
        req.url().includes(`search=${encodeURIComponent(query)}`),
    );
    await page
      .getByPlaceholder(/search by title, artist, or description/i)
      .fill(query);
    await searchRequest;

    await expect(page.getByText("Lagos Skyline")).toBeVisible();
    await expect(page.getByText("Baobab Twilight")).toHaveCount(0);

    const noMatchRequest = page.waitForRequest(
      (req) =>
        req.method() === "GET" &&
        req.url().includes(`${INDEXER_URL}/listings`) &&
        req.url().includes("search=no-such-artist"),
    );
    await page
      .getByPlaceholder(/search by title, artist, or description/i)
      .fill("no-such-artist");
    await noMatchRequest;

    await expect(page.getByText("No artworks found")).toBeVisible();
    await expect(
      page.getByText(/adjusting your search or filters/i),
    ).toBeVisible();
  });
});
