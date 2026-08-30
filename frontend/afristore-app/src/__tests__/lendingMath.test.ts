import {
  calculateAccruedInterest,
  calculateHealthFactor,
  MAX_HEALTH_FACTOR_BPS,
  DEFAULT_DECLARED_PRICE_USD,
} from "@/lib/lendingMath";

// Reference vectors are taken from contracts/lending/src/interest.rs tests +
// contracts/lending/README.md health-factor formula.

describe("calculateAccruedInterest", () => {
  const PRICE = 100_000_000n; // $100 with 7 decimals

  it("returns 0 when no months have elapsed", () => {
    expect(calculateAccruedInterest([500], 0, PRICE)).toBe(0n);
  });

  it("accrues one full month at the schedule rate", () => {
    // 1 month at 500 bps (5%) on $100 → $5.00
    expect(calculateAccruedInterest([500], 1, PRICE)).toBe(5_000_000n);
  });

  it("accrues several months at a constant rate", () => {
    // 3 months at 500 bps → $15.00
    expect(calculateAccruedInterest([500], 3, PRICE)).toBe(15_000_000n);
  });

  it("uses the second month's rate once the schedule advances", () => {
    // month 1 at 500 bps + month 2 at 800 bps → $13.00
    expect(calculateAccruedInterest([500, 800], 2, PRICE)).toBe(13_000_000n);
  });

  it("repeats the last schedule entry indefinitely (contract test vector)", () => {
    // month 0: 500 bps → 5_000_000
    // month 1: 800 bps → 8_000_000
    // month 2: 800 bps (last repeats) → 8_000_000
    // total = 21_000_000
    expect(calculateAccruedInterest([500, 800], 3, PRICE)).toBe(21_000_000n);
  });

  it("floors fractional elapsed months to completed months", () => {
    expect(calculateAccruedInterest([500], 1.99, PRICE)).toBe(5_000_000n);
    expect(calculateAccruedInterest([500], 0.5, PRICE)).toBe(0n);
  });

  it("uses the default contract reference price when none is supplied", () => {
    expect(DEFAULT_DECLARED_PRICE_USD).toBe(100_000_000n);
    expect(calculateAccruedInterest([500], 1)).toBe(5_000_000n);
  });

  it("accepts numeric and integer-string inputs", () => {
    expect(calculateAccruedInterest([500], 1, 100000000)).toBe(5_000_000n);
    expect(calculateAccruedInterest([500], 1, "100000000")).toBe(5_000_000n);
  });

  it("throws on an empty schedule (mirrors the contract panic)", () => {
    expect(() => calculateAccruedInterest([], 1, PRICE)).toThrow(
      "interest schedule must not be empty",
    );
  });
});

describe("calculateHealthFactor", () => {
  it("computes the bps health factor exactly", () => {
    // $150 collateral vs $100 debt → 150% → 15000 bps
    expect(calculateHealthFactor(150_000_000n, 100_000_000n)).toBe(15000n);
  });

  it("computes a below-threshold factor", () => {
    // $95 collateral vs $100 debt → 95% → 9500 bps
    expect(calculateHealthFactor(95_000_000n, 100_000_000n)).toBe(9500n);
  });

  it("factors in accrued interest as part of the debt", () => {
    // $110 collateral, $100 principal + $10 accrued interest → 100% → 10000 bps
    const debt = 100_000_000n + calculateAccruedInterest([1000], 1, 100_000_000n);
    expect(calculateHealthFactor(110_000_000n, debt)).toBe(10000n);
  });

  it("truncates fractional bps like the contract's i128 division", () => {
    // $100 collateral vs $30 debt → 33333.33… → 33333 bps
    expect(calculateHealthFactor(100_000_000n, 30_000_000n)).toBe(33333n);
  });

  it("treats zero debt as infinitely healthy", () => {
    expect(calculateHealthFactor(100_000_000n, 0n)).toBe(
      MAX_HEALTH_FACTOR_BPS,
    );
  });

  it("accepts numeric and integer-string inputs", () => {
    expect(calculateHealthFactor(150000000, "100000000")).toBe(15000n);
  });
});