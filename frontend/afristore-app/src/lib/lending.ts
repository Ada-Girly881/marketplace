// ─────────────────────────────────────────────────────────────
// lib/lending.ts — Lending protocol contract client
//
// Mirrors the entrypoints in contracts/lending/src/contract.rs.
// All lending-chain interaction flows through this module so the
// hooks/components never talk to Soroban directly.
// ─────────────────────────────────────────────────────────────

import { Address, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { config } from "./config";
import { invokeContract } from "./contract";
import {
  isE2eMockChain,
  e2eMockWhitelistCurrency,
  e2eMockUpdateBounds,
  e2eMockLendingAdmin,
} from "./e2e-chain-mock";

// ── Types mirrored from the Rust contract ────────────────────

export interface LendingConfig {
  admin: string;
  feeReceiver: string;
  platformFeeBps: number;
  liquidatorFeeBps: number;
  minBufferBps: number;
  maxBufferBps: number;
  minLiqThresholdBps: number;
  maxLiqThresholdBps: number;
  oracleAddress: string;
  maxPriceStalenessSecs: bigint;
}

export interface LendingBounds {
  minBufferBps: number;
  maxBufferBps: number;
  minLiqThresholdBps: number;
  maxLiqThresholdBps: number;
}

const READ_ONLY_CALLER_PUBLIC_KEY =
  "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

function resolveLendingContractId(): string {
  if (!config.lendingContractId) {
    throw new Error("Lending contract ID not configured");
  }
  return config.lendingContractId;
}

function toAddressScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

function asU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

// ── Admin config reads ────────────────────────────────────────

function parseLendingConfig(raw: unknown): LendingConfig {
  const obj = raw as Record<string, unknown>;
  return {
    admin: (obj.admin as Address).toString(),
    feeReceiver: (obj.feeReceiver as Address).toString(),
    platformFeeBps: Number(obj.platformFeeBps),
    liquidatorFeeBps: Number(obj.liquidatorFeeBps),
    minBufferBps: Number(obj.minBufferBps),
    maxBufferBps: Number(obj.maxBufferBps),
    minLiqThresholdBps: Number(obj.minLiqThresholdBps),
    maxLiqThresholdBps: Number(obj.maxLiqThresholdBps),
    oracleAddress: (obj.oracleAddress as Address).toString(),
    maxPriceStalenessSecs: BigInt(String(obj.maxPriceStalenessSecs)),
  };
}

/**
 * get_config — Read the platform configuration, including the protocol admin.
 */
export async function getLendingConfig(): Promise<LendingConfig | null> {
  if (isE2eMockChain()) {
    return {
      admin: e2eMockLendingAdmin(),
      feeReceiver: READ_ONLY_CALLER_PUBLIC_KEY,
      platformFeeBps: 100,
      liquidatorFeeBps: 500,
      minBufferBps: 12000,
      maxBufferBps: 20000,
      minLiqThresholdBps: 10500,
      maxLiqThresholdBps: 12000,
      oracleAddress: READ_ONLY_CALLER_PUBLIC_KEY,
      maxPriceStalenessSecs: 300n,
    };
  }

  try {
    const retVal = await invokeContract(
      READ_ONLY_CALLER_PUBLIC_KEY,
      "get_config",
      [],
      true,
      resolveLendingContractId(),
    );
    const native = scValToNative(retVal);
    if (!native) return null;
    return parseLendingConfig(native);
  } catch {
    return null;
  }
}

/**
 * Resolve the protocol admin address (best-effort; null when unreadable).
 */
export async function getLendingAdmin(): Promise<string | null> {
  const configRecord = await getLendingConfig();
  return configRecord?.admin ?? null;
}

// ── Admin mutations ───────────────────────────────────────────

/**
 * whitelist_currency — Admin whitelists a token as valid loan collateral.
 *
 * Args (per contracts/lending): currency Address + Reflector asset symbol.
 */
export async function whitelistCurrency(
  adminPublicKey: string,
  currencyAddress: string,
  symbol: string,
): Promise<void> {
  if (isE2eMockChain()) {
    e2eMockWhitelistCurrency(currencyAddress, symbol);
    return;
  }

  const args: xdr.ScVal[] = [
    toAddressScVal(currencyAddress),
    nativeToScVal(symbol, { type: "string" }),
  ];
  await invokeContract(
    adminPublicKey,
    "whitelist_currency",
    args,
    false,
    resolveLendingContractId(),
  );
}

/**
 * admin_update_bounds — Admin adjusts platform-wide buffer & threshold bounds.
 *
 * Args order matches the PlatformConfig fields: min/max buffer bps then
 * min/max liquidation-threshold bps.
 */
export async function updateBounds(
  adminPublicKey: string,
  bounds: LendingBounds,
): Promise<void> {
  if (isE2eMockChain()) {
    e2eMockUpdateBounds(bounds);
    return;
  }

  const args: xdr.ScVal[] = [
    asU32(bounds.minBufferBps),
    asU32(bounds.maxBufferBps),
    asU32(bounds.minLiqThresholdBps),
    asU32(bounds.maxLiqThresholdBps),
  ];
  await invokeContract(
    adminPublicKey,
    "admin_update_bounds",
    args,
    false,
    resolveLendingContractId(),
  );
}