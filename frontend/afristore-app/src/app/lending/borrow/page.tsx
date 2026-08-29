// ─────────────────────────────────────────────────────────────
// app/lending/borrow/page.tsx — NFT lending borrow marketplace (#727)
// ─────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { LendingProvider, useLendingContext } from "@/context/LendingContext";
import { useActiveListings } from "@/hooks/useActiveListings";
import { useLendingStats } from "@/hooks/useLendingStats";

// ── Stats banner ───────────────────────────────────────────────

function StatsBanner() {
  const { stats, isLoading } = useLendingStats();

  const fmt = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(2)}M XLM`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K XLM`
        : `${n} XLM`;

  return (
    <div className="lending-stats-banner">
      <div className="stat-item">
        <span className="stat-label">TVL</span>
        <span className="stat-value">{isLoading ? "—" : fmt(stats?.tvl ?? 0)}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">24h Volume</span>
        <span className="stat-value">
          {isLoading ? "—" : fmt(stats?.volume24h ?? 0)}
        </span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Active Loans</span>
        <span className="stat-value">
          {isLoading ? "—" : (stats?.activeLoans ?? 0).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ── Filters ────────────────────────────────────────────────────

const COLLECTIONS = ["All", "Stellar Punks", "Lumens Apes", "Cosmo Cats"];
const TOKEN_TYPES = ["All", "XLM", "USDC", "yXLM"];

function FilterBar() {
  const { filters, setFilter, resetFilters } = useLendingContext();

  const handleCollection = (c: string) =>
    setFilter({ collection: c === "All" ? null : c });

  const handleToken = (t: string) =>
    setFilter({ tokenType: t === "All" ? null : t });

  const hasFilters = filters.collection !== null || filters.tokenType !== null;

  return (
    <div className="lending-filter-bar">
      <div className="filter-group">
        <label className="filter-label">Collection</label>
        <div className="filter-pills">
          {COLLECTIONS.map((c) => (
            <button
              key={c}
              className={`filter-pill${filters.collection === (c === "All" ? null : c) ? " active" : ""}`}
              onClick={() => handleCollection(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-label">Token Type</label>
        <div className="filter-pills">
          {TOKEN_TYPES.map((t) => (
            <button
              key={t}
              className={`filter-pill${filters.tokenType === (t === "All" ? null : t) ? " active" : ""}`}
              onClick={() => handleToken(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {hasFilters && (
        <button className="filter-reset" onClick={resetFilters}>
          Clear filters
        </button>
      )}
    </div>
  );
}

// ── Listings grid ──────────────────────────────────────────────

const PAGE_SIZE = 20;

function BorrowListingsGrid() {
  const { filters } = useLendingContext();
  const [page, setPage] = useState(0);

  const { listings, total, isLoading, error, refresh } = useActiveListings({
    page,
    limit: PAGE_SIZE,
    collection: filters.collection,
    currency: filters.tokenType,
  });

  const totalPages = total != null ? Math.ceil(total / PAGE_SIZE) : null;

  if (isLoading) {
    return (
      <div className="listings-loading">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="listing-skeleton" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="listings-error">
        <p>{error}</p>
        <button onClick={refresh}>Retry</button>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="listings-empty">
        <p>No active lending offers found.</p>
        {(filters.collection || filters.tokenType) && (
          <p>Try adjusting your filters.</p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="listings-grid">
        {listings.map((listing) => (
          <div key={`${listing.seller}-${listing.token_id}`} className="listing-card">
            <div className="listing-card-header">
              <span className="listing-token-id">#{listing.token_id}</span>
              <span className={`listing-status ${String(listing.status).toLowerCase()}`}>
                {String(listing.status)}
              </span>
            </div>
            <div className="listing-card-body">
              <p className="listing-price">
                {listing.price ? `${Number(listing.price) / 1e7} XLM` : "—"}
              </p>
              <p className="listing-seller">
                {String(listing.seller).slice(0, 6)}…{String(listing.seller).slice(-4)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {totalPages != null && totalPages > 1 && (
        <div className="pagination">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Prev
          </button>
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}

// ── Page shell ─────────────────────────────────────────────────

function BorrowPageContent() {
  return (
    <main className="lending-borrow-page">
      <header className="lending-page-header">
        <h1>Borrow against NFTs</h1>
        <p>Browse active lending offers and use your NFTs as collateral.</p>
      </header>

      <StatsBanner />
      <FilterBar />
      <BorrowListingsGrid />
    </main>
  );
}

export default function BorrowPage() {
  return (
    <LendingProvider>
      <BorrowPageContent />
    </LendingProvider>
  );
}
"use client";

import Link from "next/link";
import { Coins, Sparkles, ArrowRight, Landmark } from "lucide-react";

export default function BorrowPage() {
  return (
    <div className="space-y-8">
      <div className="rounded-3xl bg-midnight-900/60 border border-white/5 p-6 sm:p-8 backdrop-blur-xl">
        <h2 className="text-xl sm:text-2xl font-bold font-display text-white">
          Borrow Liquidity Against NFTs
        </h2>
        <p className="text-sm text-white/60 mt-1 max-w-2xl">
          Browse open listings created by lenders. Deposit collateral in whitelisted Stellar tokens (e.g. USDC, XLM) to borrow African art NFTs for exhibitions, staking yield, or commercial display.
        </p>
      </div>

      <div className="rounded-3xl bg-midnight-900/40 border border-white/5 p-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400 mb-4 ring-1 ring-brand-500/20">
          <Coins size={32} />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Explore Available Lending Listings</h3>
        <p className="text-sm text-white/50 max-w-md mx-auto mb-6">
          Ready to lend your own NFTs instead? List them with customized interest rates and durations.
        </p>
        <Link
          href="/lending/lend"
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-terracotta-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/25 hover:opacity-95 transition-all"
        >
          <Landmark size={16} />
          <span>Switch to Lender Flow</span>
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
