import { test, expect } from "@playwright/test";
import { TEST_PUBLIC_KEY } from "./freighter-mock";
import {
  MarketplaceTestStore,
  setupMarketplaceMocks,
  resetE2eListingsInBrowser,
  setupWalletIndexerMocks,
  seedE2eStakingPoolInBrowser,
} from "./helpers/marketplace-mocks";
import { connectFreighterWallet } from "./helpers/wallet";

test.describe("Staking E2E", () => {
  const store = new MarketplaceTestStore();
  const COLLECTION_ADDRESS = "CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA00001";
  const collectionNfts = [
    { collectionAddress: COLLECTION_ADDRESS, tokenId: 1, name: "Masai Warrior #1" },
    { collectionAddress: COLLECTION_ADDRESS, tokenId: 2, name: "Masai Warrior #2" },
  ];

  test.beforeEach(async ({ page }) => {
    store.reset();
    await setupMarketplaceMocks(page, store);
    await resetE2eListingsInBrowser(page);
    await connectFreighterWallet(page, TEST_PUBLIC_KEY);

    // Mock owned NFTs indexer endpoint
    await setupWalletIndexerMocks(page, { tokens: collectionNfts });

    // Abort staked endpoint so fetchStakedNfts falls back to on-chain mock
    await page.route("**/wallets/*/staked", async (route) => {
      await route.abort("connectionrefused");
    });

    // Seed a staking pool for the collection
    await seedE2eStakingPoolInBrowser(page, COLLECTION_ADDRESS, 100);
  });

  test("#527: clicking stake signs transaction and moves NFT to staked tab", async ({
    page,
  }) => {
    await page.goto(`/staking?collection=${COLLECTION_ADDRESS}`);
    await page.waitForLoadState("domcontentloaded");

    // Pool stats should be visible
    await expect(page.getByText("Reward Token").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Daily Rate / NFT")).toBeVisible();
    await expect(page.getByText("Est. APY")).toBeVisible();
    await expect(page.getByText("Pool TVL")).toBeVisible();

    // Should show the Unstaked NFTs tab with our NFTs
    await expect(page.getByText("Masai Warrior #1")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Masai Warrior #2")).toBeVisible();

    // Select the first NFT by clicking on it
    await page.getByText("Masai Warrior #1").click();

    // Stake Selected button should appear
    const stakeBtn = page.getByRole("button", { name: /stake selected/i });
    await expect(stakeBtn).toBeVisible();

    // Click stake
    await stakeBtn.click();

    // Verify Staked Vault tab now has the NFT
    await page.getByRole("button", { name: /staked vault/i }).click();
    await expect(page.getByText("Masai Warrior #1")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("#528: staking dashboard calculates estimated rewards", async ({
    page,
  }) => {
    await page.goto(`/staking?collection=${COLLECTION_ADDRESS}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for pool stats to load
    await expect(page.getByText("Reward Token").first()).toBeVisible({
      timeout: 15_000,
    });

    // Select both NFTs and stake them
    await page.getByText("Masai Warrior #1").click();
    await page.getByText("Masai Warrior #2").click();

    const stakeBtn = page.getByRole("button", { name: /stake selected/i });
    await expect(stakeBtn).toBeVisible();
    await stakeBtn.click();

    // Switch to Staked Vault tab
    await page.getByRole("button", { name: /staked vault/i }).click();

    // Verify pending rewards are shown
    // Mock calculateRewards returns stakes.length * 100 = 200
    // Displayed value = 200 / 10_000_000 = 0.00002
    await expect(page.getByText(/pending rewards/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/0.00002/)).toBeVisible();

    // Verify "Claim All Rewards" button is enabled (pendingRewards > 0)
    const claimBtn = page.getByRole("button", { name: /claim all rewards/i });
    await expect(claimBtn).toBeVisible();
    await expect(claimBtn).toBeEnabled();
  });

  test("#529: clicking unstake returns NFT to wallet (unstaked tab)", async ({
    page,
  }) => {
    await page.goto(`/staking?collection=${COLLECTION_ADDRESS}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for pool stats to load
    await expect(page.getByText("Reward Token").first()).toBeVisible({
      timeout: 15_000,
    });

    // Stake the first NFT
    await page.getByText("Masai Warrior #1").click();
    const stakeBtn = page.getByRole("button", { name: /stake selected/i });
    await expect(stakeBtn).toBeVisible();
    await stakeBtn.click();

    // Switch to Staked Vault tab and verify it's there
    await page.getByRole("button", { name: /staked vault/i }).click();
    await expect(page.getByText("Masai Warrior #1")).toBeVisible({
      timeout: 10_000,
    });

    // Click Unstake on the staked NFT
    const unstakeBtn = page.getByRole("button", { name: /unstake/i }).first();
    await expect(unstakeBtn).toBeVisible();
    await unstakeBtn.click();

    // Switch back to Unstaked NFTs tab
    await page.getByRole("button", { name: /unstaked nfts/i }).click();

    // The NFT should be back in the unstaked tab
    await expect(page.getByText("Masai Warrior #1")).toBeVisible({
      timeout: 10_000,
    });
  });
});
