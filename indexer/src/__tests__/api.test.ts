import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mock Prisma before importing the router ───────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  listing: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  marketplaceEvent: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  stakedNFT: {
    findMany: vi.fn(),
  },
  collection: {
    findMany: vi.fn(),
  },
  userPreferences: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

const mockRedis = vi.hoisted(() => ({
  isOpen: false,
  isReady: false,
  get: vi.fn(),
  setEx: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  connect: vi.fn().mockRejectedValue(new Error('No Redis')),
}));

vi.mock('../db', () => ({ default: mockPrisma }));
vi.mock('../redis.js', () => ({ default: mockRedis }));

import router, { eventMatchesWallet } from '../api/routes';

// Build a minimal Express app with the router mounted at root
const app = express();
app.use(express.json());
app.use(router);

// ── Sample fixtures ───────────────────────────────────────────────────────────

const sampleListing = {
  listingId: BigInt(1),
  artist: 'GABC123',
  owner: null,
  price: '10000000.0000000',
  currency: 'XLM',
  metadataCid: 'QmTest',
  token: 'CTOKEN',
  status: 'Active',
  royaltyBps: 500,
  createdAtLedger: 100,
  updatedAtLedger: 100,
};

const sampleEvent = {
  id: 1,
  listingId: BigInt(1),
  eventType: 'LISTING_CREATED',
  actor: 'GABC123',
  data: { price: '10000000' },
  ledgerSequence: 100,
  ledgerTimestamp: new Date('2024-01-01T00:00:00Z'),
};

// ── GET /listings ─────────────────────────────────────────────────────────────

describe('GET /listings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all listings as JSON', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([sampleListing]);
    mockPrisma.listing.count.mockResolvedValue(1);

    const res = await request(app).get('/listings');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.listings)).toBe(true);
    expect(res.body.listings).toHaveLength(1);
    // BigInt was serialised to string
    expect(res.body.listings[0].listingId).toBe('1');
    expect(res.body.listings[0].artist).toBe('GABC123');
    expect(res.body.listings[0].status).toBe('Active');
    expect(res.body.total).toBe(1);
  });

  it('filters by artist query param', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([sampleListing]);

    await request(app).get('/listings?artist=GABC123');

    expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artist: 'GABC123' } })
    );
  });

  it('filters by owner query param', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([]);

    await request(app).get('/listings?owner=GBOWNER');

    expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { owner: 'GBOWNER' } })
    );
  });

  it('applies both artist and owner filters when both are provided', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([]);

    await request(app).get('/listings?artist=GABC&owner=GBOWN');

    expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artist: 'GABC', owner: 'GBOWN' } })
    );
  });

  it('returns empty array when no listings match', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([]);
    mockPrisma.listing.count.mockResolvedValue(0);

    const res = await request(app).get('/listings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ listings: [], total: 0 });
  });

  it('returns 500 when Prisma throws', async () => {
    mockPrisma.listing.findMany.mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/listings');
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('caps offset at 10000', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([]);

    await request(app).get('/listings?offset=50000');

    expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10000 })
    );
  });
});

// ── GET /listings/:id/history ─────────────────────────────────────────────────

describe('GET /listings/:id/history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the event history for a listing', async () => {
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([sampleEvent]);

    const res = await request(app).get('/listings/1/history');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].eventType).toBe('LISTING_CREATED');
    // listingId BigInt serialised to string
    expect(res.body[0].listingId).toBe('1');
  });

  it('queries by the correct BigInt listingId', async () => {
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([]);

    await request(app).get('/listings/42/history');

    expect(mockPrisma.marketplaceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { listingId: BigInt('42') } })
    );
  });

  it('returns empty array when no events exist for the listing', async () => {
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([]);

    const res = await request(app).get('/listings/99/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 when Prisma throws', async () => {
    mockPrisma.marketplaceEvent.findMany.mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/listings/1/history');
    expect(res.status).toBe(500);
  });
});

// ── GET /activity/recent ──────────────────────────────────────────────────────

describe('GET /activity/recent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns recent events', async () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      ...sampleEvent,
      id: i + 1,
      ledgerSequence: 100 + i,
    }));
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue(events);

    const res = await request(app).get('/activity/recent');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });

  it('requests at most 20 records ordered by ledger descending', async () => {
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([]);

    await request(app).get('/activity/recent');

    expect(mockPrisma.marketplaceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        orderBy: { ledgerSequence: 'desc' },
      })
    );
  });

  it('returns 500 when Prisma throws', async () => {
    mockPrisma.marketplaceEvent.findMany.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/activity/recent');
    expect(res.status).toBe(500);
  });
});

// ── GET /collections ─────────────────────────────────────────────────────────

describe('GET /collections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all collections', async () => {
    const sample = [{ contractAddress: 'CA', kind: 'normal_721', creator: 'GC', deployedAtLedger: 100 }];
    mockPrisma.collection.findMany.mockResolvedValue(sample);

    const res = await request(app).get('/collections');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filters by kind query param', async () => {
    mockPrisma.collection.findMany.mockResolvedValue([]);
    await request(app).get('/collections?kind=normal_721');
    expect(mockPrisma.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: 'normal_721' } })
    );
  });

  it('filters by creator query param', async () => {
    mockPrisma.collection.findMany.mockResolvedValue([]);
    await request(app).get('/collections?creator=GCREATOR');
    expect(mockPrisma.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { creator: 'GCREATOR' } })
    );
  });

  it('returns 500 on db error', async () => {
    mockPrisma.collection.findMany.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/collections');
    expect(res.status).toBe(500);
  });
});

// ── GET /creators/:address/collections ───────────────────────────────────────

describe('GET /creators/:address/collections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns collections for a specific creator', async () => {
    const sample = [{ contractAddress: 'CA', kind: 'lazy_1155', creator: 'GCREATOR', deployedAtLedger: 200 }];
    mockPrisma.collection.findMany.mockResolvedValue(sample);

    const res = await request(app).get('/creators/GCREATOR/collections');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filters by creator address', async () => {
    mockPrisma.collection.findMany.mockResolvedValue([]);
    await request(app).get('/creators/OTHER/collections');
    expect(mockPrisma.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { creator: 'OTHER' } })
    );
  });
});

// ── GET /wallets/:address/activity ───────────────────────────────────────────

describe('GET /wallets/:address/activity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns recent events for the wallet (actor or JSON field match)', async () => {
    const ev = {
      id: 3,
      listingId: '9',
      eventType: 'ARTWORK_SOLD',
      actor: 'GARTIST',
      data: { artist: 'GARTIST', buyer: 'GBUYER', price: '100' },
      ledgerSequence: 99,
      ledgerTimestamp: new Date('2024-01-15T00:00:00Z'),
    };
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([ev]);

    const res = await request(app).get('/wallets/GBUYER/activity?limit=10');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].eventType).toBe('ARTWORK_SOLD');
    expect(mockPrisma.marketplaceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        orderBy: { ledgerSequence: 'desc' },
      })
    );
  });
});

// ── GET /wallets/:address/royalty-stats ──────────────────────────────────────

describe('GET /wallets/:address/royalty-stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns totals for resales where the wallet is in the recipients array', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([
      { listingId: 1n, price: 100, recipients: [{ address: 'GCREATOR', percentage: 1000 }], updatedAtLedger: 100 },
      { listingId: 2n, price: 200, recipients: [{ address: 'GCREATOR', percentage: 500 }], updatedAtLedger: 200 },
    ]);

    const res = await request(app).get('/wallets/GCREATOR/royalty-stats');

    expect(res.status).toBe(200);
    expect(res.body.payoutCount).toBe(2);
    expect(parseFloat(res.body.totalEarned)).toBeCloseTo(20, 4);
    expect(res.body.lastPayout).toBe(200000);
    expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'Sold',
          NOT: { artist: 'GCREATOR' },
        },
      })
    );
  });
});

// ── GET /stats ───────────────────────────────────────────────────────────────

describe('GET /stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns overall stats successfully', async () => {
    mockPrisma.listing.count.mockImplementation(async (args?: any) => {
      if (args?.where?.status === 'Active') return 10;
      return 15; // total listings
    });
    mockPrisma.listing.aggregate.mockResolvedValue({
      _sum: { price: '5000.0000000' },
    });
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([
      { actor: 'ACTOR1' },
      { actor: 'ACTOR2' },
    ]);
    mockPrisma.marketplaceEvent.count.mockResolvedValue(5);

    const res = await request(app).get('/stats');

    expect(res.status).toBe(200);
    expect(res.body.totalListings).toBe(15);
    expect(res.body.activeListings).toBe(10);
    expect(res.body.totalVolume).toBe('5000.0000000');
    expect(res.body.activeUsers).toBe(2); // unique actors
    expect(res.body.totalEvents).toBe(5);
  });

  it('returns stats with range query param', async () => {
    mockPrisma.listing.count.mockResolvedValue(15);
    mockPrisma.listing.aggregate.mockResolvedValue({ _sum: { price: '5000' } });
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([{ actor: 'A1' }]);
    mockPrisma.marketplaceEvent.count.mockResolvedValue(3);

    const res = await request(app).get('/stats?range=week');

    expect(res.status).toBe(200);
    expect(res.body.timeRange).toBeDefined();
    expect(res.body.timeRange.from).toBeDefined();
    expect(res.body.timeRange.to).toBeDefined();
    expect(mockPrisma.marketplaceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ledgerTimestamp: expect.any(Object),
        }),
      })
    );
  });

  it('returns 400 for invalid range', async () => {
    const res = await request(app).get('/stats?range=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid range value. Use day, week, or month.');
  });

  it('returns stats with from/to query params', async () => {
    mockPrisma.listing.count.mockResolvedValue(15);
    mockPrisma.listing.aggregate.mockResolvedValue({ _sum: { price: '5000' } });
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([{ actor: 'A1' }]);
    mockPrisma.marketplaceEvent.count.mockResolvedValue(3);

    const res = await request(app).get('/stats?from=2024-01-01&to=2024-01-07');

    expect(res.status).toBe(200);
    expect(res.body.timeRange.from).toContain('2024-01-01');
    expect(res.body.timeRange.to).toContain('2024-01-07');
  });

  it('returns 400 for invalid date format', async () => {
    const res = await request(app).get('/stats?from=bad-date');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid from date format. Use ISO 8601.');
  });
});
// ── GET /wallets/:address/activity — extended coverage ───────────────────────

describe('GET /wallets/:address/activity — extended', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to limit 50 when no limit param is provided', async () => {
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([]);
    await request(app).get('/wallets/GTEST/activity');
    expect(mockPrisma.marketplaceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it('caps limit at 200 when a higher value is requested', async () => {
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([]);
    await request(app).get('/wallets/GTEST/activity?limit=500');
    expect(mockPrisma.marketplaceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 })
    );
  });

  it('returns an empty array when the wallet has no matching events', async () => {
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([]);
    const res = await request(app).get('/wallets/GNOBODY/activity');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 when the database throws', async () => {
    mockPrisma.marketplaceEvent.findMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/wallets/GTEST/activity');
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('queries both the actor field and JSON data fields', async () => {
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([]);
    const addr = 'GACTORTEST';
    await request(app).get(`/wallets/${addr}/activity`);
    const call = mockPrisma.marketplaceEvent.findMany.mock.calls[0][0] as any;
    // Should contain an OR clause covering actor + multiple JSON paths
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR.length).toBeGreaterThan(1);
    const hasActorClause = call.where.OR.some((c: any) => c.actor === addr);
    expect(hasActorClause).toBe(true);
  });

  it('orders results by ledgerSequence descending', async () => {
    mockPrisma.marketplaceEvent.findMany.mockResolvedValue([]);
    await request(app).get('/wallets/GTEST/activity');
    expect(mockPrisma.marketplaceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { ledgerSequence: 'desc' } })
    );
  });
});

// ── GET /wallets/:address/royalty-stats — extended coverage ──────────────────

describe('GET /wallets/:address/royalty-stats — extended', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns zeros when the wallet has no secondary sales', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([]);
    const res = await request(app).get('/wallets/GNEW/royalty-stats');
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.totalEarned)).toBe(0);
    expect(res.body.payoutCount).toBe(0);
    expect(res.body.lastPayout).toBe(0);
  });

  it('handles percentage of zero without producing NaN', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([
      { listingId: 1n, price: 500, recipients: [{ address: 'GCREATOR', percentage: 0 }], updatedAtLedger: 10 },
    ]);
    const res = await request(app).get('/wallets/GCREATOR/royalty-stats');
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.totalEarned)).toBe(0);
    expect(res.body.payoutCount).toBe(1);
  });

  it('returns 500 when the database throws', async () => {
    mockPrisma.listing.findMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/wallets/GCREATOR/royalty-stats');
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('picks the most recent updatedAtLedger as lastPayout', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([
      { listingId: 1n, price: 100, recipients: [{ address: 'GCREATOR', percentage: 500 }], updatedAtLedger: 50 },
      { listingId: 2n, price: 200, recipients: [{ address: 'GCREATOR', percentage: 500 }], updatedAtLedger: 200 }, // latest
      { listingId: 3n, price: 150, recipients: [{ address: 'GCREATOR', percentage: 500 }], updatedAtLedger: 30 },
    ]);
    const res = await request(app).get('/wallets/GCREATOR/royalty-stats');
    expect(res.status).toBe(200);
    expect(res.body.lastPayout).toBe(200 * 1000);
  });

  it('correctly filters out self-sales', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([
      { listingId: 1n, price: 100, recipients: [{ address: 'GCREATOR', percentage: 500 }], updatedAtLedger: 50 },
    ]);
    await request(app).get('/wallets/GCREATOR/royalty-stats');
    expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { artist: 'GCREATOR' },
          status: 'Sold',
        }),
      })
    );
  });

  it('accumulates totalEarned correctly across multiple resales', async () => {
    // 100 @ 1000 bps = 10; 200 @ 500 bps = 10; total = 20
    mockPrisma.listing.findMany.mockResolvedValue([
      { listingId: 1n, price: 100, recipients: [{ address: 'GCREATOR', percentage: 1000 }], updatedAtLedger: 100 },
      { listingId: 2n, price: 200, recipients: [{ address: 'GCREATOR', percentage: 500 }],  updatedAtLedger: 200 },
    ]);
    const res = await request(app).get('/wallets/GCREATOR/royalty-stats');
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.totalEarned)).toBeCloseTo(20, 4);
    expect(res.body.payoutCount).toBe(2);
  });
});

// ── GET /wallets/:address/portfolio ──────────────────────────────────────────

describe('GET /wallets/:address/portfolio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns total portfolio value based on collection floor prices', async () => {
    // Wallet owns NFTs in two collections
    mockPrisma.listing.findMany.mockResolvedValue([
      { collection: 'COLLECTION_A' },
      { collection: 'COLLECTION_A' },
      { collection: 'COLLECTION_B' },
    ]);
    mockPrisma.stakedNFT.findMany.mockResolvedValue([
      { collection: 'COLLECTION_B' },
    ]);

    // Floor prices: A=100, B=50 (lowest Active listing in each collection)
    mockPrisma.listing.findFirst
      .mockResolvedValueOnce({ price: '100.0000000' })   // COLLECTION_A floor
      .mockResolvedValueOnce({ price: '50.0000000' });   // COLLECTION_B floor

    const res = await request(app).get('/wallets/GWALLET/portfolio');

    expect(res.status).toBe(200);
    expect(res.body.totalValue).toBe('150.0000000');
    expect(res.body.collectionFloorPrices).toEqual({
      COLLECTION_A: '100.0000000',
      COLLECTION_B: '50.0000000',
    });
    expect(res.body.ownedCount).toBe(4); // 3 listings + 1 staked
  });

  it('returns zero when wallet owns no NFTs', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([]);
    mockPrisma.stakedNFT.findMany.mockResolvedValue([]);

    const res = await request(app).get('/wallets/GEMPTY/portfolio');

    expect(res.status).toBe(200);
    expect(res.body.totalValue).toBe('0.0000000');
    expect(res.body.collectionFloorPrices).toEqual({});
    expect(res.body.ownedCount).toBe(0);
  });

  it('excludes collections with no active floor price', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([
      { collection: 'COLLECTION_X' },
    ]);
    mockPrisma.stakedNFT.findMany.mockResolvedValue([]);

    // No Active listing exists for this collection
    mockPrisma.listing.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/wallets/GWALLET/portfolio');

    expect(res.status).toBe(200);
    expect(res.body.totalValue).toBe('0.0000000');
    expect(res.body.collectionFloorPrices).toEqual({});
  });

  it('returns 500 when Prisma throws', async () => {
    mockPrisma.listing.findMany.mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/wallets/GWALLET/portfolio');
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('sums floor prices from multiple collections correctly', async () => {
    // 3 collections: floor prices 10, 200, 3000
    mockPrisma.listing.findMany.mockResolvedValue([
      { collection: 'C1' },
      { collection: 'C2' },
      { collection: 'C3' },
    ]);
    mockPrisma.stakedNFT.findMany.mockResolvedValue([]);

    mockPrisma.listing.findFirst
      .mockResolvedValueOnce({ price: '10.0000000' })
      .mockResolvedValueOnce({ price: '200.0000000' })
      .mockResolvedValueOnce({ price: '3000.0000000' });

    const res = await request(app).get('/wallets/GWALLET/portfolio');

    expect(res.status).toBe(200);
    expect(res.body.totalValue).toBe('3210.0000000');
    expect(res.body.ownedCount).toBe(3);
  });

  it('deduplicates collections when wallet has both owned and staked NFTs in same collection', async () => {
    mockPrisma.listing.findMany.mockResolvedValue([
      { collection: 'COLLECTION_C' },
    ]);
    mockPrisma.stakedNFT.findMany.mockResolvedValue([
      { collection: 'COLLECTION_C' },
    ]);

    mockPrisma.listing.findFirst.mockResolvedValue({ price: '75.5000000' });

    const res = await request(app).get('/wallets/GWALLET/portfolio');

    expect(res.status).toBe(200);
    // Floor price counted only once despite two entries in same collection
    expect(res.body.totalValue).toBe('75.5000000');
    expect(res.body.ownedCount).toBe(2);
    expect(mockPrisma.listing.findFirst).toHaveBeenCalledTimes(1);
// ── PUT /wallets/:address/preferences (POST /settings) ───────────────────────

describe('PUT /wallets/:address/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a new preferences record via upsert when none exists', async () => {
    const savedPrefs = {
      walletAddress: 'GWALLET',
      theme: 'light',
      currency: 'USDC',
      priceAlerts: true,
    };
    mockPrisma.userPreferences.upsert.mockResolvedValue(savedPrefs);

    const res = await request(app)
      .put('/wallets/GWALLET/preferences')
      .send({ theme: 'light', currency: 'USDC', priceAlerts: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(savedPrefs);
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletAddress: 'GWALLET' },
        create: expect.objectContaining({
          walletAddress: 'GWALLET',
          theme: 'light',
          currency: 'USDC',
          priceAlerts: true,
        }),
      })
    );
  });

  it('updates an existing preferences record via upsert', async () => {
    const updatedPrefs = {
      walletAddress: 'GWALLET',
      theme: 'dark',
      currency: 'XLM',
      priceAlerts: false,
    };
    mockPrisma.userPreferences.upsert.mockResolvedValue(updatedPrefs);

    const res = await request(app)
      .put('/wallets/GWALLET/preferences')
      .send({ theme: 'dark', currency: 'XLM', priceAlerts: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updatedPrefs);
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletAddress: 'GWALLET' },
        update: expect.objectContaining({
          theme: 'dark',
          currency: 'XLM',
          priceAlerts: false,
        }),
      })
    );
  });

  it('handles partial updates with only theme provided', async () => {
    mockPrisma.userPreferences.upsert.mockResolvedValue({
      walletAddress: 'GWALLET',
      theme: 'light',
      currency: 'XLM',
      priceAlerts: false,
    });

    const res = await request(app)
      .put('/wallets/GWALLET/preferences')
      .send({ theme: 'light' });

    expect(res.status).toBe(200);
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ theme: 'light' }),
      })
    );
  });

  it('uses defaults for create when fields are omitted', async () => {
    mockPrisma.userPreferences.upsert.mockResolvedValue({
      walletAddress: 'GWALLET',
      theme: 'dark',
      currency: 'XLM',
      priceAlerts: false,
    });

    const res = await request(app)
      .put('/wallets/GWALLET/preferences')
      .send({});

    expect(res.status).toBe(200);
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          walletAddress: 'GWALLET',
          theme: 'dark',
          currency: 'XLM',
          priceAlerts: false,
        }),
      })
    );
  });

  it('returns 500 when Prisma throws during upsert', async () => {
    mockPrisma.userPreferences.upsert.mockRejectedValue(new Error('DB down'));

    const res = await request(app)
      .put('/wallets/GWALLET/preferences')
      .send({ theme: 'dark' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('passes undefined update fields when body is empty so Prisma ignores them', async () => {
    mockPrisma.userPreferences.upsert.mockResolvedValue({
      walletAddress: 'GEMPTY',
      theme: 'dark',
      currency: 'XLM',
      priceAlerts: false,
    });

    const res = await request(app)
      .put('/wallets/GEMPTY/preferences')
      .send({});

    expect(res.status).toBe(200);
    const call = mockPrisma.userPreferences.upsert.mock.calls[0][0] as any;
    // update should not contain undefined values leaking through
    expect(call.update.theme).toBeUndefined();
    expect(call.update.currency).toBeUndefined();
    expect(call.update.priceAlerts).toBeUndefined();
  });
});

// ── SSE wallet filtering (issue #468) ─────────────────────────────────────────

describe('eventMatchesWallet', () => {
  const wallet = 'GWALLET';

  it('matches when actor equals the wallet', () => {
    expect(eventMatchesWallet({ actor: wallet, data: {} }, wallet)).toBe(true);
  });

  it('matches when top-level recipient equals the wallet', () => {
    expect(
      eventMatchesWallet({ actor: 'GOTHER', recipient: wallet, data: {} }, wallet)
    ).toBe(true);
  });

  it('matches buyer / artist / offerer fields in data', () => {
    expect(
      eventMatchesWallet({ actor: 'GOTHER', data: { buyer: wallet } }, wallet)
    ).toBe(true);
    expect(
      eventMatchesWallet({ actor: 'GOTHER', data: { artist: wallet } }, wallet)
    ).toBe(true);
    expect(
      eventMatchesWallet({ actor: 'GOTHER', data: { offerer: wallet } }, wallet)
    ).toBe(true);
  });

  it('matches royalty recipients array', () => {
    expect(
      eventMatchesWallet(
        {
          actor: 'GOTHER',
          data: { recipients: [{ address: wallet, percentage: 500 }] },
        },
        wallet
      )
    ).toBe(true);
  });

  it('returns false for unrelated events', () => {
    expect(
      eventMatchesWallet(
        { actor: 'GOTHER', data: { buyer: 'GBUYER', artist: 'GARTIST' } },
        wallet
      )
    ).toBe(false);
  });
});

