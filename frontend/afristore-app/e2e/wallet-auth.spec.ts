import { test, expect, Page } from "@playwright/test";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const MOCK_PUBLIC_KEY =
  "GBVFEOFMZAUI7WVPDMGTQZ3BO63BKGKVFKFKMLMDAZDCIYB2MZZXKVW";

/**
 * Injects a mock Freighter extension that returns a successful connection.
 * Must be called before page.goto() so addInitScript fires before app code.
 */
async function injectConnectedWallet(
  page: Page,
  networkPassphrase = TESTNET_PASSPHRASE,
) {
  await page.addInitScript(
    ({ pub, netPass }) => {
      // Mark extension as present
      (window as any).freighter = { version: "5.0.0-mock" };

      // Stub the window.stellar API that @stellar/freighter-api v2 uses
      (window as any).stellar = {
        isConnected: () => Promise.resolve({ isConnected: true }),
        userInfo: () => Promise.resolve({ publicKey: pub }),
        getNetworkDetails: () =>
          Promise.resolve({
            network: netPass.includes("Test") ? "TESTNET" : "PUBLIC",
            networkPassphrase: netPass,
            sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          }),
        signTransaction: (_xdr: string) =>
          Promise.resolve({ signedTxXdr: "mock-signed-xdr" }),
        setAllowed: () => Promise.resolve({ isAllowed: true }),
      };
    },
    { pub: MOCK_PUBLIC_KEY, netPass: networkPassphrase },
  );
}

/**
 * Opens the Connect Wallet modal via the navbar button.
 */
async function openWalletModal(page: Page) {
  await page
    .getByRole("button", { name: /connect wallet/i })
    .first()
    .click();
}

test.describe("Freighter Wallet Authentication", () => {
  test.beforeEach(async ({ page }) => {
    // Inject a mock wallet that is connected and on the correct network
    await injectConnectedWallet(page, TESTNET_PASSPHRASE);
  });

  test("allows a user to connect their wallet successfully", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open the wallet connection modal
    await openWalletModal(page);
    await expect(
      page.getByRole("heading", { name: /connect wallet/i }),
    ).toBeVisible();

    // 2. Click the Freighter Wallet button to initiate connection
    await page.getByRole("button", { name: /freighter wallet/i }).click();

    // 3. Verify success state and public key display
    await expect(page.getByText(/success/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(MOCK_PUBLIC_KEY, { exact: false })).toBeVisible();

    // 4. Verify the modal closes automatically and the navbar updates
    await expect(
      page.getByRole("heading", { name: /connect wallet/i }),
    ).not.toBeVisible({ timeout: 4000 });
    await expect(
      page.getByRole("button", { name: /connect wallet/i }).first(),
    ).not.toBeVisible({ timeout: 6000 });
  });
});