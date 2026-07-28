import { Page } from "@playwright/test";

export const E2E_METADATA_CID = "QmE2eTestMetadataCid";
export const E2E_IMAGE_CID = "QmE2eTestImageCid";

export const MOCK_ARTWORK_METADATA = {
  title: "E2E Serengeti Sunset",
  description: "Automated test listing",
  artist: "E2E Artist",
  image: `ipfs://${E2E_IMAGE_CID}`,
  year: "2024",
  category: "Digital Art",
};

export interface E2eIndexerListing {
  listing_id: number;
  artist: string;
  metadata_cid: string;
  price: string;
  currency: string;
  token: string;
  status: string;
  owner: string | null;
  created_at: number;
  original_creator: string;
  royalty_bps: number;
  recipients: Array<{ address: string; percentage: number }>;
}

/** Shared across pages in a test — indexer mock reads from here. */
export class MarketplaceTestStore {
  listings: E2eIndexerListing[] = [];

  reset() {
    this.listings = [];
  }

  upsertActive(listing: E2eIndexerListing) {
    this.listings = this.listings.filter(
      (l) => l.listing_id !== listing.listing_id,
    );
    this.listings.push(listing);
  }

  markSold(listingId: number, buyer: string) {
    this.listings = this.listings.map((l) =>
      l.listing_id === listingId ? { ...l, status: "Sold", owner: buyer } : l,
    );
  }

  activeListings() {
    return this.listings.filter((l) => l.status === "Active");
  }
}

const INDEXER_URL = (
  process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

/**
 * Mocks IPFS uploads, metadata gateway reads, and indexer listing API.
 * Chain calls use NEXT_PUBLIC_E2E_MOCK_CHAIN on the dev server.
 */
export async function setupMarketplaceMocks(
  page: Page,
  store: MarketplaceTestStore,
) {
  await page.route("**/api/ipfs/upload-image", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ cid: E2E_IMAGE_CID }),
    });
  });

  await page.route("**/api/ipfs/upload-metadata", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ cid: E2E_METADATA_CID }),
    });
  });

  const fulfillMetadata = async (route: {
    fulfill: (opts: object) => Promise<void>;
  }) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ARTWORK_METADATA),
    });
  };

  await page.route("**/gateway.pinata.cloud/ipfs/**", fulfillMetadata);
  await page.route("**/ipfs.io/ipfs/**", fulfillMetadata);

  await page.route(`${INDEXER_URL}/listings**`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    const url = new URL(route.request().url());
    const statusFilter = url.searchParams.get("status");
    const artistFilter = url.searchParams.get("artist");
    let rows = store.listings;
    if (statusFilter && statusFilter !== "All") {
      rows = rows.filter((l) => l.status === statusFilter);
    }
    if (artistFilter) {
      rows = rows.filter((l) => l.artist === artistFilter);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ listings: rows, total: rows.length }),
    });
  });

  await page.route(`${INDEXER_URL}/auctions**`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

/** Mock wallet token / activity / preferences endpoints used by dashboard & profile. */
export async function setupWalletIndexerMocks(
  page: Page,
  options?: {
    tokens?: unknown;
    activity?: unknown[];
    royaltyStats?: {
      totalEarned: string;
      payoutCount: number;
      lastPayout: number;
    };
    preferences?: {
      theme?: string;
      currency?: string;
      priceAlerts?: boolean;
    };
  },
) {
  const tokens = options?.tokens ?? [];
  const activity = options?.activity ?? [];
  const royaltyStats = options?.royaltyStats ?? {
    totalEarned: "0.00",
    payoutCount: 0,
    lastPayout: 0,
  };
  const preferences = options?.preferences ?? {};

  await page.route("**/wallets/*/tokens", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tokens),
    });
  });

  await page.route("**/wallets/*/activity**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(activity),
    });
  });

  await page.route("**/wallets/*/royalty-stats**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(royaltyStats),
    });
  });

  await page.route("**/wallets/*/preferences", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(preferences),
      });
      return;
    }
    if (method === "PUT") {
      const body = route.request().postDataJSON() ?? {};
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...preferences, ...body }),
      });
      return;
    }
    return route.continue();
  });
}

export async function resetE2eListingsInBrowser(page: Page) {
  await page.evaluate(() => {
    (
      window as Window & { __E2E_RESET_LISTINGS__?: () => void }
    ).__E2E_RESET_LISTINGS__?.();
  });
}

export async function seedE2eAuctionInBrowser(
  page: Page,
  auction: {
    auction_id: number;
    creator: string;
    metadata_cid?: string;
    collection: string;
    token_id: number;
    token: string;
    reserve_price: bigint;
    highest_bid: bigint;
    highest_bidder: string | null;
    end_time: number;
    status: "Active" | "Finalized" | "Cancelled";
    recipients: Array<{ address: string; percentage: number }>;
    created_at: number;
  },
) {
  await page.evaluate((a) => {
    (
      window as Window & { __E2E_SEED_AUCTION__?: (auction: any) => void }
    ).__E2E_SEED_AUCTION__?.({
      ...a,
      reserve_price: BigInt(a.reserve_price),
      highest_bid: BigInt(a.highest_bid),
    });
  }, {
    ...auction,
    reserve_price: String(auction.reserve_price),
    highest_bid: String(auction.highest_bid),
  });
}
