// In-memory chain mock for Playwright E2E (NEXT_PUBLIC_E2E_MOCK_CHAIN=true).

import { DEFAULT_TOKEN } from "@/config/tokens";
import type { Listing, Auction } from "./contract";

let nextListingId = 9001;
const listings = new Map<number, Listing>();

let nextAuctionId = 8001;
const auctions = new Map<number, Auction>();

declare global {
  interface Window {
    __E2E_GET_LISTINGS__?: () => Listing[];
    __E2E_RESET_LISTINGS__?: () => void;
    __E2E_GET_AUCTIONS__?: () => Auction[];
    __E2E_RESET_AUCTIONS__?: () => void;
    __E2E_SEED_AUCTION__?: (auction: Auction) => void;
  }
}

export function isE2eMockChain(): boolean {
  return process.env.NEXT_PUBLIC_E2E_MOCK_CHAIN === "true";
}

export function resetE2eMockListings(): void {
  listings.clear();
  nextListingId = 9001;
}

export function getE2eMockListings(): Listing[] {
  return Array.from(listings.values());
}

export function resetE2eMockAuctions(): void {
  auctions.clear();
  nextAuctionId = 8001;
}

export function getE2eMockAuctions(): Auction[] {
  return Array.from(auctions.values());
}

export function getE2eMockAuction(auctionId: number): Auction {
  const auction = auctions.get(auctionId);
  if (!auction) {
    throw new Error(`Auction #${auctionId} not found`);
  }
  return { ...auction };
}

export function seedE2eMockAuction(auction: Auction): void {
  auctions.set(auction.auction_id, { ...auction });
}

export function registerE2eMockListingsOnWindow(): void {
  if (typeof window === "undefined") return;
  window.__E2E_GET_LISTINGS__ = getE2eMockListings;
  window.__E2E_RESET_LISTINGS__ = () => {
    resetE2eMockListings();
    resetE2eMockAuctions();
  };
  window.__E2E_GET_AUCTIONS__ = getE2eMockAuctions;
  window.__E2E_RESET_AUCTIONS__ = resetE2eMockAuctions;
  window.__E2E_SEED_AUCTION__ = seedE2eMockAuction;

  if (Array.isArray((window as any).__E2E_PENDING_AUCTIONS__)) {
    for (const a of (window as any).__E2E_PENDING_AUCTIONS__) {
      seedE2eMockAuction(a);
    }
  }
}

export function e2eMockCreateListing(
  artistPublicKey: string,
  price: number,
  tokenAddress: string = DEFAULT_TOKEN.address,
  collectionAddress: string,
  nftTokenId: number,
): number {
  const id = nextListingId++;
  const priceStroops = BigInt(Math.round(price * 10_000_000));
  listings.set(id, {
    listing_id: id,
    artist: artistPublicKey,
    collection: collectionAddress,
    token_id: nftTokenId,
    price: priceStroops,
    currency: DEFAULT_TOKEN.symbol,
    token: tokenAddress,
    recipients: [{ address: artistPublicKey, percentage: 100 }],
    status: "Active",
    owner: null,
    created_at: Math.floor(Date.now() / 1000),
  });
  return id;
}

export function e2eMockBuyArtwork(
  buyerPublicKey: string,
  listingId: number,
): boolean {
  const listing = listings.get(listingId);
  if (!listing || listing.status !== "Active") {
    throw new Error("Listing is not available for purchase.");
  }
  if (listing.artist === buyerPublicKey) {
    throw new Error("Cannot buy your own listing.");
  }
  listing.status = "Sold";
  listing.owner = buyerPublicKey;
  return true;
}

export function e2eMockPlaceBid(
  bidderPublicKey: string,
  auctionId: number,
  amountXlm: number,
): boolean {
  const auction = auctions.get(auctionId);
  if (!auction) {
    throw new Error(`Auction #${auctionId} not found`);
  }
  if (auction.status !== "Active") {
    throw new Error("Auction is not active");
  }
  const amountStroops = BigInt(Math.round(amountXlm * 10_000_000));
  auction.highest_bid = amountStroops;
  auction.highest_bidder = bidderPublicKey;
  return true;
}

export function e2eMockFinalizeAuction(
  callerPublicKey: string,
  auctionId: number,
): boolean {
  const auction = auctions.get(auctionId);
  if (!auction) {
    throw new Error(`Auction #${auctionId} not found`);
  }
  auction.status = "Finalized";
  return true;
}

