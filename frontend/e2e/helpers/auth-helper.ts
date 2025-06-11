import { Page } from '@playwright/test';

export interface AuthCredentials {
  email: string;
  password: string;
}

export async function loginUser(page: Page, credentials?: AuthCredentials): Promise<void> {
  console.log('🔑 Starting user login process...');
  
  // Use credentials from environment variables if not provided
  const email = credentials?.email || process.env.PLAYWRIGHT_TEST_ACCOUNT_EMAIL;
  const password = credentials?.password || process.env.PLAYWRIGHT_TEST_ACCOUNT_PASSWORD;
  
  if (!email || !password) {
    throw new Error('Missing login credentials. Please set PLAYWRIGHT_TEST_ACCOUNT_EMAIL and PLAYWRIGHT_TEST_ACCOUNT_PASSWORD in .env file');
  }
  
  console.log(`🔑 Logging in with email: ${email}`);
  
  // Navigate to login page
  await page.goto('https://localhost:5173/login');
  await page.waitForLoadState('networkidle');
  
  // Wait for login form to be visible - try multiple approaches
  await page.waitForSelector('input[type="text"], input[type="email"], input', { timeout: 10000 });
  console.log('✅ Login form found');
  
  // Fill in email field - use multiple selectors as backup
  const emailField = page.locator('input[type="email"]').or(
    page.locator('input[type="text"]').first()
  ).or(
    page.locator('input').first()
  );
  
  await emailField.fill(email);
  console.log('✅ Email filled');
  
  // Fill in password field
  const passwordField = page.locator('input[type="password"]');
  
  await passwordField.fill(password);
  console.log('✅ Password filled');
  
  // Click sign in button
  const signInButton = page.locator('button:has-text("Sign In")').or(
    page.locator('button:has-text("Login")')
  ).or(
    page.locator('button[type="submit"]')
  ).first();
  
  await signInButton.click();
  console.log('✅ Sign in button clicked');
  
  // Wait for login to complete - look for redirect away from login page
  await page.waitForFunction(() => {
    return !window.location.pathname.includes('/login');
  }, { timeout: 15000 });
  
  console.log('✅ Login completed successfully');
  
  // Optional: Wait for any authentication token to be set
  await page.waitForTimeout(1000);
  
  // Verify we have an auth token
  const hasToken = await page.evaluate(() => {
    return localStorage.getItem('access_token') !== null;
  });
  
  if (hasToken) {
    console.log('✅ Authentication token found in localStorage');
  } else {
    console.log('⚠️ No authentication token found in localStorage');
  }
}

export async function navigateToStudio(page: Page): Promise<void> {
  console.log('📍 Navigating to studio...');
  
  await page.goto('https://localhost:5173/studio');
  await page.waitForLoadState('networkidle');
  
  // Wait for studio to load
  await page.waitForTimeout(3000);
  
  // Wait for Add Track button to ensure studio is loaded
  await page.waitForSelector('button:has-text("Add Track")', { timeout: 20000 });
  console.log('✅ Studio loaded successfully');
}

export async function loginAndNavigateToStudio(page: Page, credentials?: AuthCredentials): Promise<void> {
  await loginUser(page, credentials);
  await navigateToStudio(page);
}

export async function isUserLoggedIn(page: Page): Promise<boolean> {
  // Check if we have an auth token
  const hasToken = await page.evaluate(() => {
    return localStorage.getItem('access_token') !== null;
  });
  
  // Check if we're not on login/register pages
  const currentUrl = page.url();
  const isOnAuthPage = currentUrl.includes('/login') || currentUrl.includes('/register');
  
  return hasToken && !isOnAuthPage;
}