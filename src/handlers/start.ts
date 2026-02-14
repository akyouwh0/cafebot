import { Context } from 'grammy';
import { getOrCreateUser, getUserUsuals, getStats } from '../db';

export async function handleStart(ctx: Context) {
  const user = ctx.from;
  if (!user) return;
  
  const name = user.first_name || user.username || 'there';
  getOrCreateUser(user.id, name);
  
  const usuals = getUserUsuals(user.id);
  
  let message = `☕ *Welcome to SmartQ Bot!*\n\n`;
  message += `Hey ${name}! I can help you order drinks from the office cafes.\n\n`;
  
  message += `*Commands:*\n`;
  message += `/new - Place a new order\n`;
  message += `/usual - Order your saved favorites\n`;
  message += `/save - Save current order as usual\n`;
  message += `/stats - Bot statistics\n\n`;
  
  if (usuals.length > 0) {
    message += `📋 *Your saved orders:* ${usuals.length}\n`;
    message += `Use /usual to quick-order them!`;
  } else {
    message += `💡 *Tip:* After ordering, use /save to save it for one-tap reordering!`;
  }
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
}

export async function handleStats(ctx: Context) {
  const stats = getStats();
  
  let message = `📊 *Bot Statistics*\n\n`;
  message += `👥 Unique users: ${stats.uniqueUsers}\n`;
  message += `☕ Total orders: ${stats.totalOrders}`;
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
}
