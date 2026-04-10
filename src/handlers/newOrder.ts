import { Context, InlineKeyboard } from 'grammy';
import { getCafes, getRestaurants, getMenuItems, placeOrder, areCafesOpen, getOpenCafes, getSubmenuOptions } from '../api/smartq';
import { getOrCreateUser, logOrder } from '../db';
import { setPendingSave } from './usuals';
import * as fs from 'fs';
import * as path from 'path';

// Load settings
function getSettings(): { testingMode: boolean; testName: string; testNotes: string } {
  try {
    const settingsPath = path.join(__dirname, '../config/settings.json');
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    return { testingMode: false, testName: 'test', testNotes: 'please don\'t make this order' };
  }
}

// Emoji mapping for cafes
const CAFE_EMOJI: Record<string, string> = {
  'SEVEN_SEEDS': '🌱',
  'KAAPI_VIBE': '☕',
  'CHAI_MAADI': '🫖',
  'HIC_CUP': '🧋',
  'HICCUP': '🧋',
  'DAILY_BREW': '☕'
};

// Session storage for order flow (in production, use proper session middleware)
const orderSessions = new Map<number, {
  step: 'cafe' | 'restaurant' | 'item' | 'customize' | 'notes' | 'confirm';
  cafe?: { id: string; name: string };
  restaurant?: { id: string; name: string };
  item?: { id: string; name: string; submenu?: string[] };
  customizations?: Record<string, string>;
  customizeIndex?: number; // Which submenu option we're on
  baristaNotes?: string; // Custom notes for the barista
}>();

// Helper to show confirmation screen
async function showConfirmation(ctx: Context, session: NonNullable<ReturnType<typeof orderSessions.get>>, user: { id: number; first_name?: string; username?: string }) {
  const keyboard = new InlineKeyboard()
    .text('✅ Confirm Order', 'confirm')
    .row()
    .text('📝 Edit Notes', 'notes:add')
    .row()
    .text('⬅️ Back', session.item?.submenu?.length ? 'back:cust' : 'back:item')
    .text('❌ Cancel', 'cancel');
  
  // Build customization summary
  let custSummary = '';
  if (session.customizations) {
    for (const [key, val] of Object.entries(session.customizations)) {
      custSummary += `   • ${key}: ${val}\n`;
    }
  }
  
  let msg = `📝 *Order Summary*\n\n`;
  msg += `🏪 Cafe: ${session.cafe!.name}\n`;
  msg += `📂 Category: ${session.restaurant!.name}\n`;
  msg += `☕ Item: ${session.item!.name}\n`;
  if (custSummary) {
    msg += `🔧 Options:\n${custSummary}`;
  }
  if (session.baristaNotes) {
    msg += `📝 Notes: _${session.baristaNotes}_\n`;
  }
  msg += `👤 Name: ${user.first_name || user.username}\n\n`;
  msg += `Ready to order?`;
  
  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

// Helper to show customization step
function buildCustomizeKeyboard(cafeId: string, submenuName: string): InlineKeyboard {
  const options = getSubmenuOptions(cafeId, submenuName);
  const keyboard = new InlineKeyboard();
  
  for (const opt of options) {
    const label = opt.default ? `${opt.name} ✓` : opt.name;
    keyboard.text(label, `cust:${submenuName}:${opt.name}`).row();
  }
  
  return keyboard;
}

export async function handleNew(ctx: Context) {
  console.log('[handleNew] Starting...');
  try {
    const user = ctx.from;
    if (!user) {
      console.log('[handleNew] No user found');
      return;
    }
    
    console.log('[handleNew] User:', user.id, user.first_name);
    getOrCreateUser(user.id, user.first_name || user.username || 'User');
    
    // Show all cafes with hardcoded menus
    const cafes = [
      { id: 'HIC_CUP', name: 'HicCup' },
      { id: 'SEVEN_SEEDS', name: 'Seven Seeds' },
      { id: 'KAAPI_VIBE', name: 'Kaapi Vibe' },
      { id: 'CHAI_MAADI', name: 'Chai Maadi' }
    ];
  
  const keyboard = new InlineKeyboard();
  
  for (const cafe of cafes) {
    const emoji = CAFE_EMOJI[cafe.id] || '☕';
    keyboard.text(`${emoji} ${cafe.name}`, `cafe:${cafe.id}:${cafe.name}`).row();
  }
  keyboard.text('❌ Cancel', 'cancel');
  
    orderSessions.set(user.id, { step: 'cafe' });
    
    console.log('[handleNew] Sending reply...');
    await ctx.reply('🏪 *Select a cafe:*', {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    console.log('[handleNew] Reply sent successfully');
  } catch (err) {
    console.error('[handleNew] Error:', err);
    throw err;
  }
}

export async function handleOrderCallback(ctx: Context) {
  const user = ctx.from;
  if (!user || !ctx.callbackQuery?.data) return;
  
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();
  
  // Cancel
  if (data === 'cancel') {
    orderSessions.delete(user.id);
    await ctx.editMessageText('❌ Order cancelled.');
    return;
  }
  
  const session = orderSessions.get(user.id);
  if (!session) {
    await ctx.editMessageText('⚠️ Session expired. Use /new to start again.');
    return;
  }
  
  // Handle cafe selection
  if (data.startsWith('cafe:')) {
    const [, cafeId, cafeName] = data.split(':');
    session.cafe = { id: cafeId, name: cafeName };
    session.step = 'restaurant';
    
    // Hardcoded categories per cafe
    const CAFE_CATEGORIES: Record<string, { id: string; name: string }[]> = {
      'HIC_CUP': [
        { id: 'coffee', name: '☕ Coffee' },
        { id: 'tea', name: '🫖 Tea' },
        { id: 'otherbeverages', name: '🥤 Other Beverages' }
      ],
      'SEVEN_SEEDS': [
        { id: 'coffee', name: '☕ Coffee' },
        { id: 'tea', name: '🫖 Chai' },
        { id: 'otherbeverages', name: '🥤 Other Beverages' }
      ],
      'KAAPI_VIBE': [
        { id: 'coffee', name: '☕ Coffee' },
        { id: 'tea', name: '🫖 Chai' },
        { id: 'otherbeverages', name: '🥤 Other Beverages' }
      ],
      'CHAI_MAADI': [
        { id: 'coffee', name: '☕ Coffee' },
        { id: 'tea', name: '🫖 Tea' },
        { id: 'otherbeverages', name: '🥤 Other Beverages' }
      ],
      'DAILY_BREW': [
        { id: 'coffee', name: '☕ Coffee' }
      ]
    };
    
    const categories = CAFE_CATEGORIES[cafeId] || [{ id: 'coffee', name: '☕ Coffee' }];
    
    const keyboard = new InlineKeyboard();
    for (const cat of categories) {
      keyboard.text(cat.name, `rest:${cat.id}:${cat.name}`).row();
    }
    keyboard.text('⬅️ Back', 'back:cafe').text('❌ Cancel', 'cancel');
    
    await ctx.editMessageText(`☕ *${cafeName}*\n\nSelect a category:`, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    return;
  }
  
  // Handle restaurant selection
  if (data.startsWith('rest:')) {
    const [, restId, restName] = data.split(':');
    session.restaurant = { id: restId, name: restName };
    session.step = 'item';
    
    try {
      console.log(`[DEBUG] getMenuItems: cafe=${session.cafe!.id}, rest=${restId}`);
      const items = await getMenuItems(session.cafe!.id, restId);
      console.log(`[DEBUG] Got ${items.length} items`);
      
      if (items.length === 0) {
        await ctx.editMessageText(`⚠️ No items available in ${restName}.\n\nMenu API pending implementation.`, {
          parse_mode: 'Markdown'
        });
        return;
      }
      
      const keyboard = new InlineKeyboard();
      for (const item of items) {
        // Truncate callback data to avoid Telegram's 64-byte limit
        const submenuStr = (item.submenu || []).join(',');
        const callbackData = `item:${item.foodid}`;
        console.log(`[DEBUG] Item: ${item.foodname}, callback: ${callbackData} (${callbackData.length} bytes)`);
        keyboard.text(item.foodname, callbackData).row();
      }
      keyboard.text('⬅️ Back', 'back:rest').text('❌ Cancel', 'cancel');
      
      await ctx.editMessageText(`🍽️ *${session.cafe!.name} > ${restName}*\n\nSelect an item:`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (err) {
      console.error('[ERROR] Loading items:', err);
      console.error('Error fetching menu items:', err);
      await ctx.editMessageText('❌ Error loading items. Please try again.');
    }
    return;
  }
  
  // Handle item selection
  if (data.startsWith('item:')) {
    // Callback data format: item:CAFE_ID:category:item_slug
    const foodId = data.substring(5); // Remove "item:" prefix
    
    // Look up item details from menu
    const items = await getMenuItems(session.cafe!.id, session.restaurant!.id);
    const selectedItem = items.find(i => i.foodid === foodId);
    
    if (!selectedItem) {
      await ctx.editMessageText('⚠️ Item not found. Use /new to start again.');
      orderSessions.delete(user.id);
      return;
    }
    
    session.item = { id: foodId, name: selectedItem.foodname, submenu: selectedItem.submenu };
    session.customizations = {};
    
    // If item has submenu options, show customization
    if (selectedItem.submenu && selectedItem.submenu.length > 0) {
      session.step = 'customize';
      session.customizeIndex = 0;
      
      const firstSubmenu = selectedItem.submenu[0];
      const keyboard = buildCustomizeKeyboard(session.cafe!.id, firstSubmenu);
      keyboard.row().text('⬅️ Back', 'back:item').text('❌ Cancel', 'cancel');
      
      await ctx.editMessageText(
        `☕ *${session.item.name}*\n\n🔧 *${firstSubmenu}:*`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return;
    }
    
    // No customization needed, ask about barista notes
    session.step = 'notes';
    
    const keyboard = new InlineKeyboard()
      .text('📝 Add Notes', 'notes:add')
      .text('➡️ Continue', 'notes:skip')
      .row()
      .text('⬅️ Back', 'back:item')
      .text('❌ Cancel', 'cancel');
    
    await ctx.editMessageText(
      `☕ *${session.item.name}*\n\n📝 *Barista Notes:*\nWant to add any special instructions?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }
  
  // Handle customization selection
  if (data.startsWith('cust:')) {
    const [, submenuName, optionId] = data.split(':');
    
    // Store the selection
    session.customizations = session.customizations || {};
    session.customizations[submenuName] = optionId;
    
    // Move to next customization or confirm
    const submenuList = session.item?.submenu || [];
    const nextIndex = (session.customizeIndex || 0) + 1;
    
    if (nextIndex < submenuList.length) {
      // Show next customization option
      session.customizeIndex = nextIndex;
      const nextSubmenu = submenuList[nextIndex];
      const keyboard = buildCustomizeKeyboard(session.cafe!.id, nextSubmenu);
      keyboard.row().text('⬅️ Back', 'back:cust').text('❌ Cancel', 'cancel');
      
      await ctx.editMessageText(
        `☕ *${session.item!.name}*\n\n🔧 *${nextSubmenu}:*`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return;
    }
    
    // All customizations done, ask about barista notes
    session.step = 'notes';
    
    const keyboard = new InlineKeyboard()
      .text('📝 Add Notes', 'notes:add')
      .text('➡️ Continue', 'notes:skip')
      .row()
      .text('⬅️ Back', 'back:cust')
      .text('❌ Cancel', 'cancel');
    
    await ctx.editMessageText(
      `☕ *${session.item!.name}*\n\n📝 *Barista Notes:*\nWant to add any special instructions?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }
  
  // Handle notes
  if (data.startsWith('notes:')) {
    const action = data.split(':')[1];
    
    if (action === 'skip') {
      // Skip notes, go to confirm
      session.step = 'confirm';
      await showConfirmation(ctx, session, user);
      return;
    }
    
    if (action === 'add') {
      // Ask user to type notes
      await ctx.editMessageText(
        `☕ *${session.item!.name}*\n\n📝 *Type your barista notes:*\n_(e.g., "extra hot", "less sugar", "tall mug")_`,
        { parse_mode: 'Markdown' }
      );
      // Keep step as 'notes' - text handler will pick it up
      return;
    }
    return;
  }
  
  // Handle confirm
  if (data === 'confirm') {
    if (!session.cafe || !session.restaurant || !session.item) {
      await ctx.editMessageText('⚠️ Incomplete order. Use /new to start again.');
      orderSessions.delete(user.id);
      return;
    }
    
    const settings = getSettings();
    const customerName = settings.testingMode ? settings.testName : (user.first_name || user.username || 'Guest');
    
    // Combine barista notes and test notes
    let notes: string | undefined;
    if (settings.testingMode && session.baristaNotes) {
      notes = `${session.baristaNotes} | ${settings.testNotes}`;
    } else if (settings.testingMode) {
      notes = settings.testNotes;
    } else if (session.baristaNotes) {
      notes = session.baristaNotes;
    }
    
    const modeText = settings.testingMode ? ' (TEST MODE)' : '';
    await ctx.editMessageText(`⏳ Placing your order...${modeText}`);
    
    const result = await placeOrder(
      customerName,
      session.cafe.id,
      session.restaurant.id,
      session.item.id,
      1,
      session.customizations,
      notes
    );
    
    if (result.success) {
      logOrder(user.id, session.cafe.id, session.item.name, result.orderId);
      
      // Set up pending save for this order
      setPendingSave(
        user.id,
        session.cafe.id,
        session.cafe.name,
        session.restaurant.id,
        session.restaurant.name,
        session.item.id,
        session.item.name,
        session.customizations,
        notes
      );
      
      // Build customization summary for display
      let custSummary = '';
      if (session.customizations && Object.keys(session.customizations).length > 0) {
        custSummary = Object.values(session.customizations).join(', ');
      }
      
      let msg = `✅ *Order Placed!*\n\n`;
      msg += `📋 Order ID: \`${result.orderId}\`\n`;
      msg += `☕ ${session.item.name}`;
      if (custSummary) msg += ` _(${custSummary})_`;
      msg += `\n`;
      msg += `🏪 ${session.cafe.name}\n`;
      msg += `👤 ${customerName}\n\n`;
      msg += `Pick up when ready! 🎉`;
      
      const keyboard = new InlineKeyboard()
        .text('💾 Save to Usuals', 'usual:save');
      
      await ctx.editMessageText(msg, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } else {
      await ctx.editMessageText(
        `❌ *Order Failed*\n\n${result.error}\n\n_Note: Order API implementation pending - need to capture during business hours._`,
        { parse_mode: 'Markdown' }
      );
    }
    
    orderSessions.delete(user.id);
    return;
  }
  
  // Handle back navigation
  if (data.startsWith('back:')) {
    const backTo = data.split(':')[1];
    
    if (backTo === 'cafe') {
      // Go back to cafe selection
      session.step = 'cafe';
      session.cafe = undefined;
      await handleNew(ctx);
    } else if (backTo === 'rest') {
      // Re-show restaurant selection
      session.step = 'restaurant';
      session.restaurant = undefined;
      // Trigger restaurant fetch again by simulating cafe selection
      const fakeCtx = { ...ctx, callbackQuery: { ...ctx.callbackQuery, data: `cafe:${session.cafe!.id}:${session.cafe!.name}` } };
      await handleOrderCallback(fakeCtx as any);
    } else if (backTo === 'item') {
      // Re-show item selection
      session.step = 'item';
      session.item = undefined;
      session.customizations = {};
      session.customizeIndex = 0;
      const fakeCtx = { ...ctx, callbackQuery: { ...ctx.callbackQuery, data: `rest:${session.restaurant!.id}:${session.restaurant!.name}` } };
      await handleOrderCallback(fakeCtx as any);
    } else if (backTo === 'cust') {
      // Go back to previous customization or item selection
      const currentIndex = session.customizeIndex || 0;
      
      if (currentIndex === 0) {
        // Go back to item selection
        session.step = 'item';
        session.item = undefined;
        session.customizations = {};
        const fakeCtx = { ...ctx, callbackQuery: { ...ctx.callbackQuery, data: `rest:${session.restaurant!.id}:${session.restaurant!.name}` } };
        await handleOrderCallback(fakeCtx as any);
      } else {
        // Go to previous customization
        session.customizeIndex = currentIndex - 1;
        const prevSubmenu = session.item!.submenu![currentIndex - 1];
        
        // Remove the selection for current and later submenus
        const submenuList = session.item!.submenu || [];
        for (let i = currentIndex; i < submenuList.length; i++) {
          delete session.customizations![submenuList[i]];
        }
        
        const keyboard = buildCustomizeKeyboard(session.cafe!.id, prevSubmenu);
        keyboard.row().text('⬅️ Back', currentIndex - 1 === 0 ? 'back:item' : 'back:cust').text('❌ Cancel', 'cancel');
        
        await ctx.editMessageText(
          `☕ *${session.item!.name}*\n\n🔧 *${prevSubmenu}:*`,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      }
    }
    return;
  }
}

// Handle text messages for barista notes
export async function handleNotesInput(ctx: Context) {
  const user = ctx.from;
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : null;
  
  if (!user || !text) return false;
  
  const session = orderSessions.get(user.id);
  if (!session || session.step !== 'notes') return false;
  
  // Store the notes
  session.baristaNotes = text;
  session.step = 'confirm';
  
  // Show confirmation
  const keyboard = new InlineKeyboard()
    .text('✅ Confirm Order', 'confirm')
    .row()
    .text('📝 Edit Notes', 'notes:add')
    .row()
    .text('⬅️ Back', session.item?.submenu?.length ? 'back:cust' : 'back:item')
    .text('❌ Cancel', 'cancel');
  
  // Build customization summary
  let custSummary = '';
  if (session.customizations) {
    for (const [key, val] of Object.entries(session.customizations)) {
      custSummary += `   • ${key}: ${val}\n`;
    }
  }
  
  let msg = `📝 *Order Summary*\n\n`;
  msg += `🏪 Cafe: ${session.cafe!.name}\n`;
  msg += `📂 Category: ${session.restaurant!.name}\n`;
  msg += `☕ Item: ${session.item!.name}\n`;
  if (custSummary) {
    msg += `🔧 Options:\n${custSummary}`;
  }
  msg += `📝 Notes: _${session.baristaNotes}_\n`;
  msg += `👤 Name: ${user.first_name || user.username}\n\n`;
  msg += `Ready to order?`;
  
  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
  
  return true; // Indicates we handled the message
}

export { orderSessions };
