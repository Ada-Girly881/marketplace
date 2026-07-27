import { test, expect } from "@playwright/test";
import { connectFreighterWallet } from "./helpers/wallet";

const MOCK_PUBLIC_KEY =
  "GBVFEOFMZAUI7WVPDMGTQZ3BO63BKGKVFKFKMLMDAZDCIYB2MZZXKVW";

const MOCK_LISTINGS = [
  {
    id: "clv16g90l000108l96g3g5d7y",
    title: "Hand-carved Wooden Mask",
    description: "A beautiful, traditional mask from the Ashanti region.",
    price: "120.50",
    seller: MOCK_PUBLIC_KEY,
    asset_id: "WOODMASK:GB...",
    image_url: "/images/mock-mask.jpg",
  },
];

test.describe("Profile Page", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API endpoint that fetches user listings
    await page.route(
      `**/users/${MOCK_PUBLIC_KEY}/listings`,
      async (route) => {
        await route.fulfill({ json: MOCK_LISTINGS });
      },
    );

    // Connect a mock wallet to simulate an authenticated user
    await connectFreighterWallet(page, MOCK_PUBLIC_KEY);
  });

  test("displays user's active listings", async ({ page }) => {
    await page.goto(`/profile/${MOCK_PUBLIC_KEY}`);

    // Verify that the "My Listings" section is visible
    await expect(page.getByRole("heading", { name: "My Listings" })).toBeVisible();

    // Verify that the mocked listing card is rendered on the page
    await expect(page.getByText(MOCK_LISTINGS[0].title)).toBeVisible();
  });
});
