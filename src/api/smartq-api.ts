/**
 * SmartQ Direct API Client
 * Makes direct API calls without browser automation
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'https://app.thesmartq.com';

// Load session config
function loadSession(): { userid: string; mobilenumber: string; location: string; qr_code: string } {
  const configPath = path.join(__dirname, '../config/session.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      userid: config.userid,
      mobilenumber: config.mobilenumber,
      location: config.location || 'gogo',
      qr_code: config.qr_code || '310062707944675550'
    };
  } catch (err) {
    console.error('[SmartQ API] Failed to load session config:', err);
    return {
      userid: 'gogo~guest@noreply.com',
      mobilenumber: 'guest',
      location: 'gogo',
      qr_code: '310062707944675550'
    };
  }
}

// Load menu data for a cafe
export function loadMenuData(cafeId: string, restaurantId: string): any {
  const dataPath = path.join(__dirname, `../data/${cafeId.toLowerCase()}-${restaurantId}.json`);
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch {
    // Fallback: try loading from the combined file
    const fallbackPath = path.join(__dirname, '../data/menus.json');
    try {
      const allMenus = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
      return allMenus[cafeId]?.[restaurantId] || null;
    } catch {
      return null;
    }
  }
}

// Generate order ID format: TE{7-digit}Z{timestamp}
function generateOrderId(): string {
  const num = Math.floor(1000000 + Math.random() * 9000000);
  const now = new Date();
  const timestamp = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  return `TE${num}Z${timestamp}`;
}

// Build the order payload
function buildOrderPayload(
  customerName: string,
  cafeId: string,
  restaurantId: string,
  foodItem: any,
  quantity: number,
  selectedOptions: Record<string, { name: string; foodid: string }>,
  notes?: string
): any {
  const session = loadSession();
  const orderId = generateOrderId();
  const now = new Date();
  const timestamp = now.toLocaleString('en-IN', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true 
  });

  // Build submenu list from selected options
  const submenulist = Object.entries(selectedOptions).map(([header, opt], idx) => ({
    name: opt.name,
    foodid: opt.foodid,
    foodname: opt.name,
    subitem_header: header,
    quantity: 1,
    price: 0,
    sequence_id: String(idx + 1),
    gsttaxes: '{"cgsttax": 0.0, "ugsttax": 0.0, "cesstax": 0.0, "sgsttax": 0.0}',
    tax_split: { sgsttax: 0, cgsttax: 0, cesstax: 0, ugsttax: 0 },
    pretax_price: 0,
    item_total_cost: 0,
    item_total_tax: 0,
    pretax_total_cost: 0,
    subsidyamount: 0,
    deliverycharges: 0,
    free_quantity: 0,
    itemsincontainer: 1,
    servingtime: '00:00-23:59'
  }));

  // Build linked_subitems from selected options
  const linked_subitems: Record<string, any[]> = {};
  Object.entries(selectedOptions).forEach(([header, opt]) => {
    linked_subitems[header] = [{
      name: opt.name,
      foodid: opt.foodid,
      type: 'item',
      price: 0,
      quantity: 1,
      chargeableQuantity: 1,
      free_quantity: 0
    }];
  });

  // Build selectedSubmenu
  const selectedSubmenu: Record<string, Record<string, number>> = {};
  Object.entries(selectedOptions).forEach(([header, opt]) => {
    selectedSubmenu[header] = { [opt.name]: 1 };
  });

  const foodUniqueId = `${foodItem.foodid}~${now.toLocaleDateString('en-GB').split('/').reverse().join('-')}-${now.toTimeString().slice(0, 8).replace(/:/g, ':')}`;

  return {
    paymentmethod: 'dummy',
    orderid: orderId,
    useecash: true,
    foodcourtid: cafeId,
    foodcourt: cafeId,
    cartoption: {
      flatnumber: customerName,
      roomnumber: notes || '',
      cartOptionsData: {
        flatnumber: { id: 'Name', label: customerName },
        roomnumber: { id: 'Barista Notes', label: notes || '' }
      }
    },
    cartdetails: {
      [`${cafeId}:${restaurantId}`]: {
        isbuffetorder: true,
        name: restaurantId.charAt(0).toUpperCase() + restaurantId.slice(1),
        hidenotetokitchen: true,
        cartitems: [{
          ...foodItem,
          quantity,
          foodUniqueId,
          submenuObject: foodUniqueId,
          pricewithsubitems: 0,
          hidePrice: true,
          selectedSubmenu,
          subitems: Object.fromEntries(
            Object.entries(selectedOptions).map(([header, opt]) => [header, [opt.name]])
          ),
          linked_subitems
        }],
        hidePaymentMode: true,
        restaurantid: `${cafeId}:${restaurantId}`,
        ordertype: 'dinein'
      }
    },
    deliveryloc: 'dinein',
    cookie: '',
    sender: 'app',
    flowid: 'dinein',
    flow_extras: '{}',
    savecard: true,
    appversion: 'web1',
    timestamp,
    credit_codes: [],
    configured_cartoption_id: 'allday',
    usesodexo: false,
    orderextras: {
      flow_extras: '{}',
      configured_cartoption_id: 'allday',
      credit_codes: [],
      device_type: 'desktop'
    },
    billdetails: {
      total_tax: 0,
      other_charges: {},
      sub_total: 0,
      foodcourtname: cafeId.replace('_', ' '),
      discounted_billamount: 0,
      tax: {},
      total: 0
    },
    foodorderlist: [{
      foodid: foodItem.foodid,
      foodname: foodItem.foodname,
      quantity,
      price: 0,
      restaurantid: `${cafeId}:${restaurantId}`,
      restaurantName: restaurantId.charAt(0).toUpperCase() + restaurantId.slice(1),
      resturantid: `${cafeId}:${restaurantId}`,
      submenulist,
      linked_subitems,
      selectedSubmenu,
      subitems: Object.fromEntries(
        Object.entries(selectedOptions).map(([header, opt]) => [header, [opt.name]])
      ),
      submenu: Object.keys(selectedOptions),
      allSubmenu: Object.keys(selectedOptions),
      foodUniqueId,
      submenuObject: foodUniqueId,
      pricewithsubitems: 0,
      hidePrice: true,
      seq: 1,
      sequence_id: '1',
      gsttaxes: '{"cgsttax": 0, "ugsttax": 0, "cesstax": 0, "sgsttax": 0}',
      tax_split: { sgsttax: 0, cgsttax: 0, cesstax: 0, ugsttax: 0 },
      taxes: { sgsttax: 0, ugsttax: 0, cesstax: 0, cgsttax: 0 },
      pretax_price: 0,
      pretax_total_cost: 0,
      item_total_cost: 0,
      item_total_tax: 0,
      display_price: '0',
      is_available: true,
      vegflag: 'V',
      healthflag: '',
      dietarynote: '',
      calories: 0,
      campaigns: [],
      allergens: [],
      offer_text: '',
      preferred_items: [],
      servingtime: '00:00-23:59',
      sessionlist: ['allday'],
      view_only_item: false,
      enable_as_mealdeal: false,
      foodinfo: '',
      fooddescription: '',
      shortdescription: foodItem.shortdescription || '',
      imageurl: foodItem.imageurl || '',
      backend_extras: foodItem.backend_extras || '{}',
      listofcategories: ['Hot Beverages'],
      itemcategory: 'Hot Beverages',
      preptime: 0
    }],
    isMultipleOrder: false,
    codes: [],
    notetokitchen: ''
  };
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

/**
 * Place an order via direct API call
 */
export async function placeOrderDirect(
  customerName: string,
  cafeId: string,
  restaurantId: string,
  foodId: string,
  quantity: number = 1,
  customizations?: Record<string, string>,
  notes?: string
): Promise<OrderResult> {
  console.log('[SmartQ API] Placing order:', { customerName, cafeId, restaurantId, foodId, quantity, customizations, notes });
  
  // Load menu data
  const menuData = loadMenuData(cafeId.toLowerCase().replace('_', '-'), restaurantId);
  if (!menuData) {
    return { success: false, error: `Menu data not found for ${cafeId}:${restaurantId}` };
  }
  
  // Find the food item
  const foodItem = menuData.menu.find((item: any) => item.foodid === foodId);
  if (!foodItem) {
    return { success: false, error: `Food item not found: ${foodId}` };
  }
  
  // Build selected options from customizations or use defaults
  const selectedOptions: Record<string, { name: string; foodid: string }> = {};
  
  for (const submenuName of (foodItem.submenu || [])) {
    const submenuData = menuData.submenu[submenuName];
    if (!submenuData) continue;
    
    // Use customization if provided, otherwise use default
    const selectedName = customizations?.[submenuName] || submenuData.default;
    const selectedFoodId = submenuData.options[selectedName];
    
    if (selectedFoodId) {
      selectedOptions[submenuName] = { name: selectedName, foodid: selectedFoodId };
    }
  }
  
  // Build the order payload
  const payload = buildOrderPayload(
    customerName,
    cafeId,
    restaurantId,
    foodItem,
    quantity,
    selectedOptions,
    notes
  );
  
  console.log('[SmartQ API] Order payload built, order ID:', payload.orderid);
  
  try {
    // Load session cookies
    const session = loadSession();
    const configPath = path.join(__dirname, '../config/session.json');
    let cookieStr = '';
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.cookies) {
        cookieStr = `unauthcookie=${config.cookies.unauthcookie}; cookie=${config.cookies.cookie}`;
      }
    } catch {}
    
    const response = await fetch(`${API_BASE}/v2/app/service/placemultipleorders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://app.thesmartq.com',
        'Referer': 'https://app.thesmartq.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'smartq_appid': 'timetoeat-pwa',
        'smartq_location': 'gogo',
        'smartq_foodcourt': cafeId,
        ...(cookieStr && { 'Cookie': cookieStr })
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json() as any;
    console.log('[SmartQ API] Response:', JSON.stringify(data).substring(0, 500));
    
    // Check various success indicators
    const orderStatus = data.extras?.orderextras?.orderstatus || data.extras?.orderstatus;
    const orderIds = data.extras?.orderextras?.orderids || [];
    
    if (orderStatus === 'orderpaid' || data.extras?.orderSuccess || orderIds.length > 0) {
      // Extract order ID from response or use our generated one
      const orderId = orderIds[0]?.split('Z')[0] || payload.orderid.split('Z')[0];
      return { success: true, orderId };
    }
    
    if (data.result === 'fail') {
      return { success: false, error: data.extras || 'API returned failure' };
    }
    
    return { success: false, error: 'Unknown API response' };
    
  } catch (err) {
    console.error('[SmartQ API] Error:', err);
    return { success: false, error: `API error: ${err}` };
  }
}
