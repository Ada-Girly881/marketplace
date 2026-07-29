import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRedisClient: any = vi.hoisted(() => ({
  isReady: true,
  flushDb: vi.fn().mockResolvedValue('OK'),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));

const mockPrisma: any = vi.hoisted(() => {
  const mPrisma: any = {
    marketplaceEvent: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    listing: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    syncState: {
      update: vi.fn().mockResolvedValue({ id: 1, lastLedger: 100, lastLedgerHash: null }),
    },
    collection: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  mPrisma.$transaction = vi.fn((callback: (tx: typeof mPrisma) => Promise<void>) => callback(mPrisma));
  return mPrisma;
});

vi.mock('../db', () => ({ default: mockPrisma }));
vi.mock('../redis', () => ({ default: mockRedisClient }));

vi.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: class {
      getLedgers = vi.fn();
      getLatestLedger = vi.fn();
      getEvents = vi.fn();
    },
  },
}));

import { revertLedgers } from '../poller';

describe('Chain Re-organization Rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => Promise<void>) => callback(mockPrisma)
    );
    mockRedisClient.isReady = true;
    mockRedisClient.flushDb.mockResolvedValue('OK');
  });

  it('deletes events and listings created after the safe ledger', async () => {
    await revertLedgers(100);

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();

    expect(mockPrisma.marketplaceEvent.deleteMany).toHaveBeenCalledWith({
      where: { ledgerSequence: { gt: 100 } },
    });

    expect(mockPrisma.listing.deleteMany).toHaveBeenCalledWith({
      where: { createdAtLedger: { gt: 100 } },
    });
  });

  it('reverts listing status for listings updated after the safe ledger', async () => {
    await revertLedgers(100);

    expect(mockPrisma.listing.updateMany).toHaveBeenCalledWith({
      where: { updatedAtLedger: { gt: 100 } },
      data: { status: 'Active', updatedAtLedger: 100 },
    });
  });

  it('deletes collections deployed after the safe ledger', async () => {
    await revertLedgers(100);

    expect(mockPrisma.collection.deleteMany).toHaveBeenCalledWith({
      where: { deployedAtLedger: { gt: 100 } },
    });
  });

  it('resets SyncState to the safe ledger with null hash', async () => {
    await revertLedgers(100);

    expect(mockPrisma.syncState.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastLedger: 100, lastLedgerHash: null },
    });
  });

  it('wraps all operations in a single transaction', async () => {
    await revertLedgers(50);

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.marketplaceEvent.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrisma.listing.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrisma.listing.updateMany).toHaveBeenCalledOnce();
    expect(mockPrisma.collection.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrisma.syncState.update).toHaveBeenCalledOnce();
  });

  it('invalidates Redis cache after successful rollback when Redis is ready', async () => {
    await revertLedgers(100);

    expect(mockRedisClient.flushDb).toHaveBeenCalledOnce();
  });

  it('skips Redis cache invalidation when Redis is not ready', async () => {
    mockRedisClient.isReady = false;

    await revertLedgers(100);

    expect(mockRedisClient.flushDb).not.toHaveBeenCalled();
  });

  it('does not throw when Redis flushDb fails', async () => {
    mockRedisClient.flushDb.mockRejectedValue(new Error('Redis connection lost'));

    await expect(revertLedgers(100)).resolves.not.toThrow();
  });

  it('propagates transaction errors to the caller', async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

    await expect(revertLedgers(100)).rejects.toThrow('Transaction failed');
  });

  it('handles graceful degradation when zero records match the safe ledger', async () => {
    mockPrisma.marketplaceEvent.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.listing.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.listing.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.collection.deleteMany.mockResolvedValue({ count: 0 });

    await expect(revertLedgers(1)).resolves.not.toThrow();
  });

  it('passes the correct safe ledger to all database operations', async () => {
    const safeLedger = 505;
    await revertLedgers(safeLedger);

    expect(mockPrisma.marketplaceEvent.deleteMany).toHaveBeenCalledWith({
      where: { ledgerSequence: { gt: safeLedger } },
    });
    expect(mockPrisma.listing.deleteMany).toHaveBeenCalledWith({
      where: { createdAtLedger: { gt: safeLedger } },
    });
    expect(mockPrisma.listing.updateMany).toHaveBeenCalledWith({
      where: { updatedAtLedger: { gt: safeLedger } },
      data: { status: 'Active', updatedAtLedger: safeLedger },
    });
    expect(mockPrisma.collection.deleteMany).toHaveBeenCalledWith({
      where: { deployedAtLedger: { gt: safeLedger } },
    });
    expect(mockPrisma.syncState.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastLedger: safeLedger, lastLedgerHash: null },
    });
  });
});
