"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getCollection, IndexerCollectionRow, fetchListings } from "@/lib/indexer";
import { Listing } from "@/lib/contract";
import { ListingCard } from "@/components/ListingCard";
import { Package, Tag, Clock } from "lucide-react";
import { clsx } from "clsx";

export default function CollectionPage() {
  const params = useParams();
  const address = params?.address;
  const collectionAddress = Array.isArray(address) ? address[0] : address;

  const [collection, setCollection] = useState<IndexerCollectionRow | null>(null);
  const [tokens, setTokens] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!collectionAddress) return;

    let isMounted = true;
    async function fetchData() {
      try {
        setIsLoading(true);
        const col = await getCollection(collectionAddress as string);
        if (!col) {
          if (isMounted) setError("Collection not found");
          return;
        }
        if (isMounted) setCollection(col);

        // Fetch tokens (listings) for this collection
        const { listings } = await fetchListings({ search: collectionAddress as string });
        if (isMounted) {
          // Filter strictly for this collection just in case search is fuzzy
          const colListings = listings.filter(l => l.collection === collectionAddress);
          setTokens(colListings);
        }
      } catch (err) {
        console.error("Failed to load collection details:", err);
        if (isMounted) setError("Failed to load collection data");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [collectionAddress]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-midnight-950 pb-20 pt-24 flex flex-col items-center justify-center space-y-6">
        <div className="h-16 w-16 rounded-[1.5rem] border-4 border-white/5 border-t-brand-500 animate-spin" />
        <p className="text-xs text-brand-400 font-bold uppercase tracking-[0.3em] animate-pulse">
          Loading Collection...
        </p>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen bg-midnight-950 pb-20 pt-24 flex flex-col items-center justify-center">
        <p className="text-white text-xl">{error || "Collection not found"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-midnight-950 pb-20 pt-24 selection:bg-brand-500 selection:text-white">
      {/* Background Pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0 overflow-hidden">
        <div className="absolute inset-0 tribal-pattern scale-150 rotate-12" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Collection Header */}
        <div className="relative mb-12 overflow-hidden rounded-[3rem] bg-midnight-900 border border-white/5 shadow-2xl p-8 sm:p-12">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/10 blur-[100px]" />
          <div className="absolute top-0 right-0 left-0 tribal-strip h-1.5 opacity-40" />

          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            <div className="flex h-32 w-32 items-center justify-center rounded-[2.2rem] bg-midnight-950 border border-white/10 shadow-2xl shrink-0">
              <Package size={56} className="text-brand-400" />
            </div>

            <div className="flex flex-col items-center md:items-start gap-4 flex-1">
              <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white">
                {collection.name || "Unnamed Collection"}
              </h1>
              {collection.symbol && (
                <p className="text-brand-300/60 font-medium text-sm tracking-widest uppercase">
                  Symbol: {collection.symbol}
                </p>
              )}
              <div className="font-mono text-xs text-mint-400/90 break-all bg-white/5 px-4 py-2.5 rounded-2xl border border-white/10 mt-2">
                {collection.contractAddress}
              </div>
              <p className="text-sm text-white/40 mt-2">
                Created by: <span className="font-mono text-mint-400">{collection.creator}</span>
              </p>
            </div>
            
            <div className="flex flex-col gap-4 self-center md:self-end">
              <div className="group rounded-[2rem] bg-white/5 border border-white/10 px-8 py-6 text-center backdrop-blur-md">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-bold mb-2">
                  Total Items
                </p>
                <p className="font-display text-4xl font-bold text-white tracking-tight">
                  {tokens.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tokens List */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
            <Tag className="text-brand-400" /> Collection Tokens
          </h2>
          {tokens.length > 0 ? (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {tokens.map((token) => (
                <div key={token.listing_id} className="hover:-translate-y-2 transition-transform duration-500">
                  <ListingCard listing={token} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-[3.5rem] bg-midnight-900/50 border-2 border-dashed border-white/5 py-32 px-10 text-center">
              <Clock size={48} className="text-white/10 mb-6" />
              <h3 className="font-display text-3xl font-bold text-white">No Tokens Found</h3>
              <p className="mt-4 text-sm text-brand-300/40 max-w-sm">
                There are no tokens available in this collection yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
