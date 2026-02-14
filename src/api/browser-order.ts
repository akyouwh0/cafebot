/**
 * Browser-based order placement for SmartQ
 * Automates the full UI flow since direct API calls require browser session
 */

import puppeteer, { Page } from 'puppeteer-core';

const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SMARTQ_BASE = 'https://app.thesmartq.com/time2eat';
const QR_CODE = '310062707944675550';

export interface BrowserOrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

// Map cafe IDs to display names
const CAFE_NAMES: Record<string, string> = {
  'HIC_CUP': 'HicCup',
  'SEVEN_SEEDS': 'Seven Seeds',
  'KAAPI_VIBE': 'Kaapi Vibe',
  'CHAI_MAADI': 'Chai Maadi',
  'DAILY_BREW': 'Daily Brew'
};

// Helper to wait and click element by text
async function clickByText(page: Page, text: string, timeout = 5000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (searchText) => {
        const elements = document.querySelectorAll('button, [role="button"], [cursor="pointer"], [style*="cursor: pointer"]');
        for (const el of elements) {
          if (el.textContent?.includes(searchText)) return true;
        }
        return false;
      },
      { timeout },
      text
    );
    
    await page.evaluate((searchText) => {
      const elements = document.querySelectorAll('button, [role="button"], [cursor="pointer"], [style*="cursor: pointer"]');
      for (const el of elements) {
        if (el.textContent?.includes(searchText)) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, text);
    
    return true;
  } catch {
    return false;
  }
}

// Helper to click checkbox by nearby text
async function clickCheckbox(page: Page, labelText: string): Promise<boolean> {
  try {
    return await page.evaluate((searchText) => {
      // Find elements containing the text
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent?.includes(searchText)) {
          // Look for nearby checkbox
          const parent = (node as Text).parentElement;
          let searchEl: Element | null = parent;
          for (let i = 0; i < 5 && searchEl; i++) {
            const checkbox = searchEl.querySelector('input[type="checkbox"]');
            if (checkbox) {
              (checkbox as HTMLInputElement).click();
              return true;
            }
            // Also look for clickable elements that act as checkboxes
            const checkboxDiv = searchEl.querySelector('[role="checkbox"], [aria-checked]');
            if (checkboxDiv) {
              (checkboxDiv as HTMLElement).click();
              return true;
            }
            searchEl = searchEl.parentElement;
          }
        }
      }
      
      // Fallback: click on the checkbox container
      const containers = document.querySelectorAll('[class*="checkbox"], [class*="Checkbox"]');
      for (const container of containers) {
        if (container.textContent?.includes(searchText)) {
          const clickable = container.querySelector('input, [role="checkbox"]') || container;
          (clickable as HTMLElement).click();
          return true;
        }
      }
      
      return false;
    }, labelText);
  } catch {
    return false;
  }
}

// Helper to type in input field by placeholder or index
async function typeInInput(page: Page, placeholderOrIndex: string | number, text: string): Promise<boolean> {
  try {
    if (typeof placeholderOrIndex === 'string') {
      const input = await page.$(`input[placeholder*="${placeholderOrIndex}" i], textarea[placeholder*="${placeholderOrIndex}" i]`);
      if (input) {
        await input.click({ clickCount: 3 });
        await input.type(text, { delay: 30 });
        return true;
      }
    }
    
    // Fallback to index
    const idx = typeof placeholderOrIndex === 'number' ? placeholderOrIndex : 0;
    const inputs = await page.$$('input[type="text"], input:not([type]), textarea');
    if (inputs[idx]) {
      await inputs[idx].click({ clickCount: 3 });
      await inputs[idx].type(text, { delay: 30 });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Helper to wait for navigation or content
async function waitForAny(page: Page, options: { texts?: string[], selectors?: string[], timeout?: number }): Promise<boolean> {
  const { texts = [], selectors = [], timeout = 5000 } = options;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    for (const text of texts) {
      const found = await page.evaluate((t) => document.body.textContent?.includes(t), text);
      if (found) return true;
    }
    for (const selector of selectors) {
      const el = await page.$(selector);
      if (el) return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

export async function placeOrderViaBrowser(
  customerName: string,
  cafeId: string,
  restaurantId: string,
  foodId: string,
  foodName: string,
  quantity: number = 1,
  customizations?: Record<string, string>,
  notes?: string
): Promise<BrowserOrderResult> {
  let browser;
  
  try {
    console.log('[BrowserOrder] Launching headless browser...');
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932 });
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
    
    // Capture order ID from response
    let capturedOrderId: string | null = null;
    page.on('response', async (response) => {
      if (response.url().includes('placemultipleorders')) {
        try {
          const data = await response.json();
          console.log('[BrowserOrder] Order API response:', JSON.stringify(data).substring(0, 500));
          if (data.orderid) {
            capturedOrderId = data.orderid.split('Z')[0]; // Just the short order ID
          }
        } catch {}
      }
    });
    
    // Step 1: Navigate to SmartQ
    console.log('[BrowserOrder] Step 1: Navigating to SmartQ...');
    await page.goto(`${SMARTQ_BASE}/main/qr-journey?code=${QR_CODE}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 2000));
    
    // Step 2: Accept cookie policy if shown
    console.log('[BrowserOrder] Step 2: Checking for cookie policy...');
    const acceptedCookie = await clickByText(page, 'Accept', 2000);
    if (acceptedCookie) {
      console.log('[BrowserOrder] Accepted cookie policy');
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Step 3: Click on Dine In
    console.log('[BrowserOrder] Step 3: Clicking Dine In...');
    await clickByText(page, 'Dine In', 5000);
    await new Promise(r => setTimeout(r, 1500));
    
    // Step 4: Select cafe (handle cafe selection dialog if present)
    const cafeName = CAFE_NAMES[cafeId] || cafeId;
    console.log(`[BrowserOrder] Step 4: Selecting cafe: ${cafeName}...`);
    
    // Check if we need to switch cafe - look for the header with current cafe name
    const currentCafe = await page.evaluate(() => {
      // Find the cafe header/selector in the page
      const header = document.querySelector('h1, h2, [class*="header"]');
      return header?.textContent?.trim() || '';
    });
    
    console.log(`[BrowserOrder] Current cafe detected: "${currentCafe}"`);
    
    if (!currentCafe.includes(cafeName)) {
      console.log(`[BrowserOrder] Switching to ${cafeName}...`);
      
      // Click on the cafe header to open dropdown
      await page.evaluate(() => {
        // Click the header with down arrow (cafe selector)
        const headers = document.querySelectorAll('h1, h2, [class*="header"], [class*="title"]');
        for (const h of headers) {
          if (h.textContent?.includes('Seeds') || h.textContent?.includes('Vibe') || h.textContent?.includes('Cup') || h.textContent?.includes('Chai')) {
            (h as HTMLElement).click();
            return true;
          }
        }
        // Also try clicking elements with dropdown indicators
        const dropdowns = document.querySelectorAll('[aria-expanded], [class*="dropdown"], [class*="select"]');
        for (const d of dropdowns) {
          (d as HTMLElement).click();
          return true;
        }
        return false;
      });
      await new Promise(r => setTimeout(r, 1500));
      
      // Now click the target cafe name from the dropdown
      await clickByText(page, cafeName, 5000);
      await new Promise(r => setTimeout(r, 2000));
    } else {
      console.log(`[BrowserOrder] Already on ${cafeName}`);
    }
    
    // Step 5: Select category (Coffee)
    const categoryDisplay = restaurantId.charAt(0).toUpperCase() + restaurantId.slice(1);
    console.log(`[BrowserOrder] Step 5: Selecting category: ${categoryDisplay}...`);
    await clickByText(page, categoryDisplay, 5000);
    await new Promise(r => setTimeout(r, 1500));
    
    // Step 6: Find and add the item
    console.log(`[BrowserOrder] Step 6: Adding item: ${foodName}...`);
    
    // Look for the item and click Add/Choose
    const itemAdded = await page.evaluate((itemName) => {
      // Find elements containing the food name
      const allElements = Array.from(document.querySelectorAll('*'));
      for (const el of allElements) {
        const elText = el.textContent?.trim();
        if (elText === itemName || el.getAttribute('aria-label')?.includes(itemName)) {
          // Find the parent card and look for Add/Choose button
          let parent: Element | null = el;
          for (let i = 0; i < 5 && parent; i++) {
            const btn = parent.querySelector('button[aria-label*="add" i], button[aria-label*="choose" i]');
            if (btn) {
              (btn as HTMLElement).click();
              return 'clicked';
            }
            // Also look for button with Add or Choose text
            const btns = parent.querySelectorAll('button');
            for (const b of btns) {
              if (b.textContent?.includes('Add') || b.textContent?.includes('Choose')) {
                (b as HTMLElement).click();
                return 'clicked';
              }
            }
            parent = parent.parentElement;
          }
        }
      }
      return null;
    }, foodName);
    
    if (!itemAdded) {
      console.log('[BrowserOrder] Could not find item, trying fallback...');
      await clickByText(page, foodName, 3000);
      await new Promise(r => setTimeout(r, 500));
      await clickByText(page, 'Add', 3000) || await clickByText(page, 'Choose', 3000);
    }
    
    await new Promise(r => setTimeout(r, 1500));
    
    // Step 7: Handle customization dialog if present (items with Choose button)
    console.log('[BrowserOrder] Step 7: Checking for customization dialog...');
    const hasCustomization = await page.evaluate(() => {
      return document.body.textContent?.includes('Customize your order') || 
             document.body.textContent?.includes('Caffeine option');
    });
    
    if (hasCustomization) {
      console.log('[BrowserOrder] Customization dialog detected, using defaults and clicking Add to Cart...');
      // The defaults (Regular caffeine, Hot) are usually pre-selected
      // Just click Add to Cart
      await clickByText(page, 'Add to Cart', 5000);
      await new Promise(r => setTimeout(r, 1500));
    }
    
    // Step 8: Click Checkout
    console.log('[BrowserOrder] Step 8: Going to checkout...');
    await clickByText(page, 'Checkout', 5000);
    await new Promise(r => setTimeout(r, 2000));
    
    // Step 9: Handle T&C acceptance if shown
    console.log('[BrowserOrder] Step 9: Checking for T&C acceptance...');
    const hasTnC = await page.evaluate(() => {
      return document.body.textContent?.includes('Terms and Conditions') ||
             document.body.textContent?.includes('Checkout as guest');
    });
    
    if (hasTnC) {
      console.log('[BrowserOrder] T&C dialog detected, accepting...');
      // Click the T&C checkbox
      await clickCheckbox(page, 'Terms and Conditions');
      await new Promise(r => setTimeout(r, 500));
      
      // Click Checkout as guest
      await clickByText(page, 'Checkout as guest', 5000);
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Step 10: Fill in name
    console.log(`[BrowserOrder] Step 10: Entering name: ${customerName}...`);
    await typeInInput(page, 'Name', customerName);
    await new Promise(r => setTimeout(r, 500));
    
    // Step 11: Fill in notes if provided (only if notes has actual content)
    if (notes && notes.trim()) {
      console.log(`[BrowserOrder] Step 11: Entering notes: ${notes}...`);
      await typeInInput(page, 'Notes', notes);
      await typeInInput(page, 'Barista', notes); // Try Barista Notes field too
      await new Promise(r => setTimeout(r, 500));
    } else {
      console.log('[BrowserOrder] Step 11: No notes to enter');
    }
    
    // Step 12: Place order
    console.log('[BrowserOrder] Step 12: Placing order...');
    await clickByText(page, 'Place Order', 5000);
    await new Promise(r => setTimeout(r, 4000));
    
    // Step 13: Check for success
    const pageContent = await page.content();
    const hasSuccess = pageContent.includes('successfully') || 
                       pageContent.includes('Hurray') ||
                       pageContent.includes('Order ID');
    
    // Try to extract order ID from page
    const orderIdMatch = pageContent.match(/TE\d{7}/);
    const orderId = capturedOrderId || orderIdMatch?.[0];
    
    console.log(`[BrowserOrder] Result: success=${hasSuccess}, orderId=${orderId}`);
    
    if (hasSuccess || orderId) {
      return {
        success: true,
        orderId: orderId || 'unknown'
      };
    }
    
    // Take screenshot for debugging
    await page.screenshot({ path: '/tmp/smartq-order-debug.png', fullPage: true });
    console.log('[BrowserOrder] Debug screenshot saved to /tmp/smartq-order-debug.png');
    
    // Check for error messages
    const errorMatch = pageContent.match(/error|fail|unable|sorry/i);
    
    return {
      success: false,
      error: errorMatch ? 'Order failed - check /tmp/smartq-order-debug.png' : 'Could not confirm order was placed'
    };
    
  } catch (err) {
    console.error('[BrowserOrder] Error:', err);
    return {
      success: false,
      error: `Browser error: ${err}`
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Simpler function for testing
export async function testBrowserOrder(): Promise<BrowserOrderResult> {
  return placeOrderViaBrowser(
    'test',
    'SEVEN_SEEDS',
    'coffee',
    'SEVEN_SEEDS:coffee:8',
    'Americano',
    1,
    undefined,
    'please don\'t make this order - bot test'
  );
}
