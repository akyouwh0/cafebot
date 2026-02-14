import { Context, InlineKeyboard } from 'grammy';
import { getUserUsuals, getUsualById, saveUsualOrder, deleteUsualOrder, UsualOrder } from '../db';
import { placeOrder } from '../api/smartq';

// Pending saves - waiting for user to provide a label
const pendingSaves = new Map<number, {
  cafeId: string;
  cafeName: string;
  restaurantId: string;
  restaurantName: string;
  foodId: string;
  foodName: string;
  customizations?: Record<string, string>;
  notes?: string;
}>();

// Emoji for cafes
const CAFE_EMOJI: Record<string, string> = {
  'SEVEN_SEEDS': '🌱',
  'KAAPI_VIBE': '☕',
  'CHAI_MAADI': '🫖',
  'HIC_CUP': '🧋',
  'DAILY_BREW': '☕'
};

/**
 * Handle /usuals command - list saved orders
 */
export async function handleUsuals(ctx: Context) {
  const user = ctx.from;
  if (!user) return;

  const usuals = getUserUsuals(user.id);

  if (usuals.length === 0) {
    await ctx.reply(
      '📋 *No saved orders yet*\n\n' +
      'After placing an order, you can save it for quick reordering!\n\n' +
      '_Use /new to place an order_',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  
  for (const usual of usuals) {
    const emoji = CAFE_EMOJI[usual.cafe_id] || '☕';
    const label = usual.label || usual.food_name;
    keyboard.text(`${emoji} ${label}`, `usual:order:${usual.id}`).row();
  }
  keyboard.text('🗑️ Manage', 'usual:manage').row();

  let msg = '⭐ *Your Saved Orders*\n\n';
  for (const usual of usuals) {
    const emoji = CAFE_EMOJI[usual.cafe_id] || '☕';
    msg += `${emoji} *${usual.label}*\n`;
    msg += `   ${usual.food_name} @ ${usual.cafe_name}\n`;
    if (usual.customizations) {
      const cust = JSON.parse(usual.customizations);
      const custStr = Object.values(cust).join(', ');
      if (custStr) msg += `   _${custStr}_\n`;
    }
    msg += '\n';
  }
  msg += '_Tap to order instantly!_';

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Handle usual order callbacks
 */
export async function handleUsualCallback(ctx: Context) {
  const user = ctx.from;
  if (!user || !ctx.callbackQuery?.data) return;

  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  // Show confirmation for usual order
  if (data.startsWith('usual:order:')) {
    const usualId = parseInt(data.split(':')[2]);
    const usual = getUsualById(usualId);

    if (!usual || usual.telegram_id !== user.id) {
      await ctx.editMessageText('⚠️ Saved order not found.');
      return;
    }

    const emoji = CAFE_EMOJI[usual.cafe_id] || '☕';
    let custSummary = '';
    if (usual.customizations) {
      const cust = JSON.parse(usual.customizations);
      custSummary = Object.values(cust).join(', ');
    }

    let msg = `📝 *Confirm Order*\n\n`;
    msg += `${emoji} *${usual.food_name}*`;
    if (custSummary) msg += ` _(${custSummary})_`;
    msg += `\n`;
    msg += `🏪 ${usual.cafe_name}\n`;
    msg += `👤 ${user.first_name || user.username}\n`;
    if (usual.notes) msg += `📝 ${usual.notes}\n`;
    msg += `\n_Place this order?_`;

    const keyboard = new InlineKeyboard()
      .text('✅ Confirm', `usual:confirm:${usualId}`)
      .text('❌ Cancel', 'usual:back');

    await ctx.editMessageText(msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    return;
  }

  // Actually place the usual order after confirmation
  if (data.startsWith('usual:confirm:')) {
    const usualId = parseInt(data.split(':')[2]);
    const usual = getUsualById(usualId);

    if (!usual || usual.telegram_id !== user.id) {
      await ctx.editMessageText('⚠️ Saved order not found.');
      return;
    }

    await ctx.editMessageText(`⏳ Ordering *${usual.food_name}* from ${usual.cafe_name}...`, {
      parse_mode: 'Markdown'
    });

    const customizations = usual.customizations ? JSON.parse(usual.customizations) : {};
    
    const result = await placeOrder(
      user.first_name || user.username || 'Guest',
      usual.cafe_id,
      usual.restaurant_id,
      usual.food_id,
      1,
      customizations,
      usual.notes || undefined
    );

    if (result.success) {
      const emoji = CAFE_EMOJI[usual.cafe_id] || '☕';
      let custSummary = '';
      if (usual.customizations) {
        custSummary = Object.values(JSON.parse(usual.customizations)).join(', ');
      }
      
      let msg = `✅ *Order Placed!*\n\n`;
      msg += `📋 Order ID: \`${result.orderId}\`\n`;
      msg += `${emoji} ${usual.food_name}`;
      if (custSummary) msg += ` _(${custSummary})_`;
      msg += `\n`;
      msg += `🏪 ${usual.cafe_name}\n`;
      msg += `👤 ${user.first_name || user.username}\n\n`;
      msg += `Pick up when ready! 🎉`;
      
      await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
    } else {
      await ctx.editMessageText(
        `❌ *Order Failed*\n\n${result.error}`,
        { parse_mode: 'Markdown' }
      );
    }
    return;
  }

  // Manage saved orders
  if (data === 'usual:manage') {
    const usuals = getUserUsuals(user.id);
    
    if (usuals.length === 0) {
      await ctx.editMessageText('No saved orders to manage.');
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const usual of usuals) {
      keyboard.text(`🗑️ ${usual.label}`, `usual:delete:${usual.id}`).row();
    }
    keyboard.text('⬅️ Back', 'usual:back');

    await ctx.editMessageText(
      '🗑️ *Delete Saved Orders*\n\n_Tap an order to delete it_',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }

  // Delete a usual
  if (data.startsWith('usual:delete:')) {
    const usualId = parseInt(data.split(':')[2]);
    const deleted = deleteUsualOrder(usualId, user.id);

    if (deleted) {
      await ctx.answerCallbackQuery({ text: '✅ Deleted!' });
    }
    
    // Refresh the manage view
    const usuals = getUserUsuals(user.id);
    if (usuals.length === 0) {
      await ctx.editMessageText('✅ All saved orders deleted.');
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const usual of usuals) {
      keyboard.text(`🗑️ ${usual.label}`, `usual:delete:${usual.id}`).row();
    }
    keyboard.text('⬅️ Back', 'usual:back');

    await ctx.editMessageText(
      '🗑️ *Delete Saved Orders*\n\n_Tap an order to delete it_',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }

  // Back to usuals list
  if (data === 'usual:back') {
    // Re-trigger usuals list
    const usuals = getUserUsuals(user.id);
    const keyboard = new InlineKeyboard();
    
    for (const usual of usuals) {
      const emoji = CAFE_EMOJI[usual.cafe_id] || '☕';
      keyboard.text(`${emoji} ${usual.label}`, `usual:order:${usual.id}`).row();
    }
    keyboard.text('🗑️ Manage', 'usual:manage').row();

    let msg = '⭐ *Your Saved Orders*\n\n';
    for (const usual of usuals) {
      const emoji = CAFE_EMOJI[usual.cafe_id] || '☕';
      msg += `${emoji} *${usual.label}*\n`;
      msg += `   ${usual.food_name} @ ${usual.cafe_name}\n\n`;
    }
    msg += '_Tap to order instantly!_';

    await ctx.editMessageText(msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    return;
  }

  // Save an order (from order flow)
  if (data === 'usual:save') {
    const pending = pendingSaves.get(user.id);
    if (!pending) {
      await ctx.editMessageText('⚠️ No order to save. Place an order first with /new');
      return;
    }

    await ctx.editMessageText(
      '💾 *Save this order*\n\n' +
      `☕ ${pending.foodName}\n` +
      `🏪 ${pending.cafeName}\n\n` +
      '_Reply with a name for this order (e.g., "My usual", "Morning coffee"):_',
      { parse_mode: 'Markdown' }
    );
    return;
  }
}

/**
 * Set pending save data (called after successful order)
 */
export function setPendingSave(
  userId: number,
  cafeId: string,
  cafeName: string,
  restaurantId: string,
  restaurantName: string,
  foodId: string,
  foodName: string,
  customizations?: Record<string, string>,
  notes?: string
) {
  pendingSaves.set(userId, {
    cafeId,
    cafeName,
    restaurantId,
    restaurantName,
    foodId,
    foodName,
    customizations,
    notes
  });
}

/**
 * Handle text message for save label
 */
export async function handleSaveLabel(ctx: Context): Promise<boolean> {
  const user = ctx.from;
  const text = ctx.message?.text;
  
  if (!user || !text) return false;
  
  const pending = pendingSaves.get(user.id);
  if (!pending) return false;

  // Save the order with the provided label
  const label = text.trim().substring(0, 50); // Limit label length
  
  saveUsualOrder(
    user.id,
    label,
    pending.cafeId,
    pending.cafeName,
    pending.restaurantId,
    pending.restaurantName,
    pending.foodId,
    pending.foodName,
    pending.customizations,
    pending.notes
  );

  pendingSaves.delete(user.id);

  await ctx.reply(
    `✅ *Saved!*\n\n` +
    `"${label}" added to your usuals.\n\n` +
    `_Use /usuals to see your saved orders_`,
    { parse_mode: 'Markdown' }
  );

  return true;
}

/**
 * Check if user has a pending save
 */
export function hasPendingSave(userId: number): boolean {
  return pendingSaves.has(userId);
}

/**
 * Clear pending save
 */
export function clearPendingSave(userId: number) {
  pendingSaves.delete(userId);
}

export { pendingSaves };
