/**
 * SmartQ API Client
 * Direct API calls using the smartq_* headers
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'https://app.thesmartq.com';
const QR_CODE = '310062707944675550';
const LOCATION = 'gogo';

// Load session config with cookies
function loadSessionConfig(): { unauthcookie: string; cookie: string } {
  try {
    const configPath = path.join(__dirname, '../config/session.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      unauthcookie: config.cookies?.unauthcookie || '',
      cookie: config.cookies?.cookie || ''
    };
  } catch {
    return { unauthcookie: '', cookie: '' };
  }
}

// Standard headers for all SmartQ API calls
function getHeaders(foodcourt?: string): Record<string, string> {
  const session = loadSessionConfig();
  const cookieStr = session.unauthcookie 
    ? `unauthcookie=${session.unauthcookie}; cookie=${session.cookie}`
    : '';
  
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Origin': API_BASE,
    'Referer': `${API_BASE}/time2eat/home/menu`,
    'smartq_appid': 'timetoeat-pwa',
    'smartq_lang': 'en-US',
    'smartq_sender': 'web',
    'smartq_os': 'web',
    'smartq_location': LOCATION,
    ...(foodcourt && { 'smartq_foodcourt': foodcourt }),
    ...(cookieStr && { 'Cookie': cookieStr })
  };
}

export interface Cafe {
  id: string;
  name: string;
  ordering: boolean;
}

export interface MenuItem {
  foodid: string;
  foodname: string;
  description?: string;
  submenu: string[];
}

export interface SubmenuOption {
  name: string;
  foodid: string;
  default?: boolean;
}

export interface MenuData {
  menu: MenuItem[];
  submenu: {
    attributes: Record<string, {
      default: string;
      list: string[];
      ismand: boolean;
    }>;
    extras: Record<string, Record<string, string>>;
  };
}

/**
 * Get list of available cafes
 */
export async function getCafeList(): Promise<Cafe[]> {
  const response = await fetch(`${API_BASE}/v2/app/unified/qr_journey`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      appid: 'timetoeat-pwa',
      appversion: 'web',
      latitude: 0,
      longitude: 0,
      os: 'web',
      qr_journey_code: QR_CODE,
      sender: 'web',
      lang: 'en-US'
    })
  });

  const data = await response.json() as any;
  const cafes = data.foodcourt_list_response?.foodcourts_list || [];
  
  return cafes.map((c: any) => ({
    id: c.id,
    name: c.name,
    ordering: c.extras?.ordering ?? true
  }));
}

/**
 * Get restaurant categories for a cafe (e.g., Coffee, Chai, etc.)
 */
export async function getRestaurantCategories(cafeId: string): Promise<{ id: string; name: string }[]> {
  const response = await fetch(`${API_BASE}/v2/app/unified/qr_journey`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      appid: 'timetoeat-pwa',
      appversion: 'web',
      latitude: 0,
      longitude: 0,
      os: 'web',
      qr_journey_code: QR_CODE,
      sender: 'web',
      lang: 'en-US'
    })
  });

  const data = await response.json() as any;
  const restaurants = data.foodcourt_list_response?.restuarant_details?.[cafeId] || [];
  
  return restaurants.map((r: any) => ({
    id: r.uniqid,
    name: r.name
  }));
}

/**
 * Get menu for a specific restaurant (e.g., SEVEN_SEEDS:coffee)
 */
export async function getMenu(cafeId: string, restaurantId: string): Promise<MenuData> {
  const response = await fetch(`${API_BASE}/v2/app/menu`, {
    method: 'POST',
    headers: getHeaders(cafeId),
    body: JSON.stringify({
      action: 'restaurantmenu',
      foodcourt: cafeId,
      foodcourtid: cafeId,
      pushid: '***NONE***',
      location: LOCATION,
      extras: {
        flowid: 'dinein',
        flow_extras: {},
        qr_journey_code: QR_CODE
      },
      restaurantidlist: [restaurantId],
      sender: 'web',
      os: 'web',
      lang: 'en-US',
      appid: 'timetoeat-pwa'
    })
  });

  const data = await response.json() as any;
  
  if (!data.menu) {
    throw new Error(data.message || 'Failed to fetch menu');
  }

  // Transform menu items
  const menu: MenuItem[] = data.menu.map((item: any) => ({
    foodid: item.foodid,
    foodname: item.foodname,
    description: item.shortdescription || item.fooddescription,
    submenu: item.submenu || []
  }));

  // Transform submenu data
  const submenu = {
    attributes: data.submenu?.attributes || {},
    extras: {} as Record<string, Record<string, string>>
  };

  // Extract foodids from submenu extras
  if (data.submenu?.extras) {
    for (const [category, options] of Object.entries(data.submenu.extras)) {
      submenu.extras[category] = {};
      for (const [optName, optData] of Object.entries(options as Record<string, any>)) {
        submenu.extras[category][optName] = optData.foodid;
      }
    }
  }

  return { menu, submenu };
}

/**
 * Get submenu options for a specific item
 */
export function getSubmenuOptions(
  menuData: MenuData,
  submenuName: string
): { options: string[]; default: string; foodids: Record<string, string> } {
  const attr = menuData.submenu.attributes[submenuName];
  const extras = menuData.submenu.extras[submenuName] || {};
  
  return {
    options: attr?.list || [],
    default: attr?.default || '',
    foodids: extras
  };
}

// Cache for menu data
const menuCache: Record<string, { data: MenuData; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get menu with caching
 */
export async function getMenuCached(cafeId: string, restaurantId: string): Promise<MenuData> {
  const key = `${cafeId}:${restaurantId}`;
  const cached = menuCache[key];
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const data = await getMenu(cafeId, restaurantId);
  menuCache[key] = { data, timestamp: Date.now() };
  return data;
}

export default {
  getCafeList,
  getRestaurantCategories,
  getMenu,
  getMenuCached,
  getSubmenuOptions
};
