import { Context, InlineKeyboard, Keyboard } from 'grammy';
import { getOrCreateUser, getUserUsuals, getStats } from '../db';

const CAFE_EMOJI: Record<string, string> = {
  'SEVEN_SEEDS': '🌱',
  'KAAPI_VIBE': '☕',
  'CHAI_MAADI': '🫖',
  'HIC_CUP': '🧋',
  'DAILY_BREW': '☕'
};

export const MAIN_KEYBOARD = new Keyboard()
  .text('☕ New Order').text('⭐ My Usuals')
  .resized()
  .persistent();

export async function handleStart(ctx: Context) {
  const user = ctx.from;
  if (!user) return;

  const name = user.first_name || user.username || 'there';
  const { isNew } = getOrCreateUser(user.id, name);
  const usuals = getUserUsuals(user.id).sort((a, b) => a.label.localeCompare(b.label));

  // For new users, send the persistent keyboard first so it sticks
  if (isNew) {
    await ctx.reply('👋 Welcome! Use the buttons below to get started.', {
      reply_markup: MAIN_KEYBOARD
    });
  }

  // Then send the home screen with inline keyboard
  const keyboard = new InlineKeyboard();

  if (usuals.length > 0) {
    for (const usual of usuals) {
      const emoji = CAFE_EMOJI[usual.cafe_id] || '☕';
      keyboard.text(`${emoji} ${usual.label}`, `usual:order:${usual.id}`).row();
    }
    keyboard.row().text('☕ New Order', 'home:new').text('🗑️ Manage', 'usual:manage');

    await ctx.reply(
      `☕ *SmartQ Cafe Bot*\n\nHey ${name}! Tap a saved order to place it instantly:`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } else {
    keyboard.text('☕ New Order', 'home:new');

    await ctx.reply(
      `☕ *SmartQ Cafe Bot*\n\nHey ${name}! Place an order to get started.\n\n_💡 Tip: After ordering, save it as a usual for one-tap reordering._`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }
}

export async function handleStats(ctx: Context) {
  const stats = getStats();
  
  let message = `📊 *Bot Statistics*\n\n`;
  message += `👥 Unique users: ${stats.uniqueUsers}\n`;
  message += `☕ Total orders: ${stats.totalOrders}`;
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
}
