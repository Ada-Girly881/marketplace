import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import redis from '../redis.js';
import { cacheMiddleware } from './cache-middleware.js';

const LENDING_CACHE_TTL = 300; // 5 minutes

const router = Router();

async function getCachedStats(cacheKey: string): Promise<any | null> {
  if (!redis || !redis.isReady) return null;
  try {
    const cached = await redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.error('[Lending API] Cache read error:', err);
    return null;
  }
}

async function setCachedStats(cacheKey: string, data: any, ttl: number = LENDING_CACHE_TTL): Promise<void> {
  if (!redis || !redis.isReady) return;
  try {
    await redis.setEx(cacheKey, ttl, JSON.stringify(data));
  } catch (err) {
    console.error('[Lending API] Cache write error:', err);
  }
}

router.get('/lending/stats', async (req: Request, res: Response) => {
  const cacheKey = 'lending:stats';

  const cached = await getCachedStats(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const totalPositions = await prisma.lendingPosition.count();
    const activePositions = await prisma.lendingPosition.count({ where: { status: 'Active' } });
    const repaidPositions = await prisma.lendingPosition.count({ where: { status: 'Repaid' } });
    const defaultedPositions = await prisma.lendingPosition.count({ where: { status: 'Defaulted' } });

    const totalLoanAmount = await prisma.lendingPosition.aggregate({
      _sum: { loanAmount: true },
      where: { status: 'Active' },
    });

    const totalCollateralValue = await prisma.lendingPosition.aggregate({
      _sum: { collateralValue: true },
      where: { status: 'Active' },
    });

    const lowHealthFactorPositions = await prisma.lendingPosition.count({
      where: {
        status: 'Active',
        healthFactor: { lt: 1.2 },
      },
    });

    const stats = {
      totalPositions,
      activePositions,
      repaidPositions,
      defaultedPositions,
      totalLoanAmount: totalLoanAmount._sum?.loanAmount?.toString() || '0',
      totalCollateralValue: totalCollateralValue._sum?.collateralValue?.toString() || '0',
      lowHealthFactorPositions,
      timestamp: new Date().toISOString(),
    };

    await setCachedStats(cacheKey, stats);
    res.json(stats);
  } catch (err) {
    console.error('[Lending API] Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch lending stats' });
  }
});

router.get('/lending/positions', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;

  const cacheKey = `lending:positions:${page}:${limit}`;

  const cached = await getCachedStats(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const positions = await prisma.lendingPosition.findMany({
      skip: offset,
      take: limit,
      orderBy: { updatedAtLedger: 'desc' },
    });

    const total = await prisma.lendingPosition.count();

    const response = {
      positions: positions.map((p) => ({
        positionId: p.positionId.toString(),
        borrower: p.borrower,
        nftCollateral: p.nftCollateral,
        nftTokenId: p.nftTokenId.toString(),
        loanAmount: p.loanAmount.toString(),
        currency: p.currency,
        interestRate: p.interestRate.toString(),
        durationDays: p.durationDays,
        loanStartTime: p.loanStartTime.toString(),
        dueDate: p.dueDate.toString(),
        status: p.status,
        healthFactor: p.healthFactor?.toString(),
        collateralValue: p.collateralValue?.toString(),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };

    await setCachedStats(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error('[Lending API] Positions error:', err);
    res.status(500).json({ error: 'Failed to fetch lending positions' });
  }
});

router.get('/lending/positions/:borrower', async (req: Request, res: Response) => {
  const borrower = req.params.borrower as string;
  const cacheKey = `lending:positions:${borrower}`;

  const cached = await getCachedStats(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const positions = await prisma.lendingPosition.findMany({
      where: { borrower: borrower as string },
      orderBy: { updatedAtLedger: 'desc' },
    });

    const response = positions.map((p) => ({
      positionId: p.positionId.toString(),
      borrower: p.borrower,
      nftCollateral: p.nftCollateral,
      nftTokenId: p.nftTokenId.toString(),
      loanAmount: p.loanAmount.toString(),
      currency: p.currency,
      interestRate: p.interestRate.toString(),
      durationDays: p.durationDays,
      loanStartTime: p.loanStartTime.toString(),
      dueDate: p.dueDate.toString(),
      status: p.status,
      healthFactor: p.healthFactor?.toString(),
      collateralValue: p.collateralValue?.toString(),
    }));

    await setCachedStats(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error('[Lending API] Borrower positions error:', err);
    res.status(500).json({ error: 'Failed to fetch borrower positions' });
  }
});

router.get('/lending/config', async (req: Request, res: Response) => {
  const cacheKey = 'lending:config';

  const cached = await getCachedStats(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const config = await prisma.lendingConfig.findUnique({
      where: { id: 1 },
    });

    if (!config) {
      return res.status(404).json({ error: 'Lending config not found' });
    }

    const response = {
      platformFeeRate: config.platformFeeRate.toString(),
      minHealthFactor: config.minHealthFactor.toString(),
      liquidationThreshold: config.liquidationThreshold.toString(),
      updatedAtLedger: config.updatedAtLedger,
      updatedAt: config.updatedAt.toISOString(),
    };

    await setCachedStats(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error('[Lending API] Config error:', err);
    res.status(500).json({ error: 'Failed to fetch lending config' });
  }
});

export default router;
