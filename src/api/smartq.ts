/**
 * SmartQ API Client
 * Provides menu data and order placement functionality
 * Now uses live API for menus with fallback to cached data
 */

import * as fs from 'fs';
import * as path from 'path';
import * as SmartQClient from './smartq-client';
import { placeOrderDirect, OrderResult } from './smartq-api';

// Re-export types
export { OrderResult };

// Types
export interface Cafe {
  id: string;
  name: string;
}

export interface Restaurant {
  uniqid: string;
  name: string;
  disabled: boolean;
  disabled_message?: string;
}

export interface MenuItem {
  foodid: string;
  foodname: string;
  shortdescription?: string;
  imageurl?: string;
  submenu?: string[];
}

// Cache for menu data
const menuCache: Record<string, { menu: MenuItem[]; submenu: any; timestamp: number }> = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Fallback menu data from JSON files
function loadFallbackMenu(cafeId: string, restaurantId: string): { menu: MenuItem[]; submenu: any } | null {
  try {
    const filename = `${cafeId.toLowerCase().replace('_', '-')}-${restaurantId}.json`;
    const filePath = path.join(__dirname, '../data', filename);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data;
  } catch {
    return null;
  }
}

/**
 * Get all cafes
 */
export async function getCafes(): Promise<Cafe[]> {
  try {
    const cafes = await SmartQClient.getCafeList();
    return cafes.filter(c => c.ordering).map(c => ({ id: c.id, name: c.name }));
  } catch (err) {
    console.error('[SmartQ] Failed to fetch cafes:', err);
    // Fallback
    return [
      { id: 'SEVEN_SEEDS', name: 'Seven Seeds' },
      { id: 'HIC_CUP', name: 'HicCup' },
      { id: 'KAAPI_VIBE', name: 'Kaapi Vibe' },
      { id: 'CHAI_MAADI', name: 'Chai Maadi' },
      { id: 'DAILY_BREW', name: 'Daily Brew' }
    ];
  }
}

/**
 * Get restaurants/categories for a cafe
 */
export async function getRestaurants(cafeId: string): Promise<Restaurant[]> {
  try {
    const categories = await SmartQClient.getRestaurantCategories(cafeId);
    return categories.map(c => ({
      uniqid: c.id,
      name: c.name,
      disabled: false
    }));
  } catch (err) {
    console.error('[SmartQ] Failed to fetch restaurants:', err);
    // Fallback - return common categories
    return [
      { uniqid: `${cafeId}:coffee`, name: 'Coffee', disabled: false },
      { uniqid: `${cafeId}:tea`, name: 'Tea', disabled: false }
    ];
  }
}

/**
 * Get menu items for a restaurant
 */
export async function getMenuItems(cafeId: string, restaurantId: string): Promise<MenuItem[]> {
  const cacheKey = `${cafeId}:${restaurantId}`;
  
  // Check cache first
  const cached = menuCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.menu;
  }
  
  try {
    // Build full restaurant ID (e.g., SEVEN_SEEDS:coffee)
    const fullRestId = restaurantId.includes(':') ? restaurantId : `${cafeId}:${restaurantId}`;
    
    const menuData = await SmartQClient.getMenu(cafeId, fullRestId);
    
    // Transform to our format
    const items: MenuItem[] = menuData.menu.map(item => ({
      foodid: item.foodid,
      foodname: item.foodname,
      shortdescription: item.description,
      submenu: item.submenu
    }));
    
    // Cache the result
    menuCache[cacheKey] = {
      menu: items,
      submenu: menuData.submenu,
      timestamp: Date.now()
    };
    
    console.log(`[SmartQ] Fetched ${items.length} items for ${cacheKey}`);
    return items;
    
  } catch (err) {
    console.error('[SmartQ] Failed to fetch menu:', err);
    
    // Try fallback
    const fallback = loadFallbackMenu(cafeId, restaurantId);
    if (fallback) {
      console.log(`[SmartQ] Using fallback menu for ${cacheKey}`);
      return fallback.menu;
    }
    
    return [];
  }
}

/**
 * Get submenu options for a specific option name
 */
export function getSubmenuOptions(cafeId: string, submenuName: string): { name: string; foodid: string; default?: boolean }[] {
  // Find cached menu data for this cafe
  for (const [key, cached] of Object.entries(menuCache)) {
    if (key.startsWith(cafeId) && cached.submenu) {
      const attr = cached.submenu.attributes?.[submenuName];
      const extras = cached.submenu.extras?.[submenuName];
      
      if (attr && extras) {
        return attr.list.map((name: string) => ({
          name,
          foodid: extras[name] || '',
          default: name === attr.default
        }));
      }
    }
  }
  
  // Hardcoded fallback for common options
  const FALLBACK_OPTIONS: Record<string, Record<string, { name: string; foodid: string; default?: boolean }[]>> = {
    'SEVEN_SEEDS': {
      'Caffeine option': [
        { name: 'Regular', foodid: 'SEVEN_SEEDS:coffee:28', default: true },
        { name: 'Decaffeinated', foodid: 'SEVEN_SEEDS:coffee:29' }
      ],
      'Hot or Iced Option': [
        { name: 'Hot', foodid: 'SEVEN_SEEDS:coffee:52', default: true },
        { name: 'Iced', foodid: 'SEVEN_SEEDS:coffee:53' }
      ],
      'Milk option': [
        { name: 'Dairy', foodid: 'SEVEN_SEEDS:coffee:51', default: true },
        { name: 'Almond', foodid: 'SEVEN_SEEDS:coffee:20' },
        { name: 'Oat', foodid: 'SEVEN_SEEDS:coffee:18' },
        { name: 'Slim', foodid: 'SEVEN_SEEDS:coffee:54' },
        { name: 'Soy', foodid: 'SEVEN_SEEDS:coffee:21' },
        { name: 'Lactose Free', foodid: 'SEVEN_SEEDS:coffee:19' }
      ],
      'Variety': [
        { name: 'VLGE', foodid: 'SEVEN_SEEDS:coffee:55', default: true },
        { name: 'Project Pearl', foodid: 'SEVEN_SEEDS:coffee:56' }
      ]
    }
  };
  
  return FALLBACK_OPTIONS[cafeId]?.[submenuName] || [];
}

/**
 * Place an order via direct API
 */
export async function placeOrder(
  customerName: string,
  cafeId: string,
  restaurantId: string,
  foodId: string,
  quantity: number = 1,
  customizations?: Record<string, string>,
  notes?: string
): Promise<OrderResult> {
  console.log('[placeOrder] Starting:', { customerName, cafeId, restaurantId, foodId, quantity, customizations, notes });
  
  // Get cached menu data if available
  const cacheKey = `${cafeId}:${restaurantId}`;
  const cachedData = menuCache[cacheKey];
  
  // If not in cache, fetch it first
  if (!cachedData) {
    console.log('[placeOrder] Menu not in cache, fetching...');
    await getMenuItems(cafeId, restaurantId);
  }
  
  const menuData = menuCache[cacheKey];
  
  return placeOrderDirect(
    customerName,
    cafeId,
    restaurantId,
    foodId,
    quantity,
    customizations,
    notes,
    menuData ? { menu: menuData.menu as any[], submenu: menuData.submenu } : undefined
  );
}

/**
 * Check if any cafes are currently open (9 AM - 5 PM IST)
 */
export async function areCafesOpen(): Promise<boolean> {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60;
  const istTime = new Date(now.getTime() + (istOffset + now.getTimezoneOffset()) * 60000);
  const hour = istTime.getHours();
  return hour >= 9 && hour < 17;
}

/**
 * Get list of open cafes
 */
export async function getOpenCafes(): Promise<Cafe[]> {
  const isOpen = await areCafesOpen();
  if (!isOpen) return [];
  return getCafes();
}

/**
 * Clear menu cache (useful after menu updates)
 */
export function clearMenuCache(): void {
  for (const key of Object.keys(menuCache)) {
    delete menuCache[key];
  }
  console.log('[SmartQ] Menu cache cleared');
}
