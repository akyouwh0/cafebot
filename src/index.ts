import 'dotenv/config';
import { Bot } from 'grammy';
import { handleStart, handleStats, MAIN_KEYBOARD } from './handlers/start';
import { handleNew, handleOrderCallback, handleNotesInput } from './handlers/newOrder';
import { handleUsuals, handleUsualCallback, handleSaveLabel, hasPendingSave } from './handlers/usuals';

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// Commands
bot.command('start', (ctx) => {
  console.log('[CMD] /start from', ctx.from?.id);
  return handleStart(ctx);
});
bot.command('help', handleStart);
bot.command('new', (ctx) => {
  console.log('[CMD] /new from', ctx.from?.id);
  return handleNew(ctx);
});
bot.command('order', handleNew); // Alias
bot.command('usual', handleUsuals);
bot.command('usuals', handleUsuals); // Alias
bot.command('stats', handleStats);

// Callback queries
bot.callbackQuery('home:new', (ctx) => {
  ctx.answerCallbackQuery();
  return handleNew(ctx);
});
bot.callbackQuery('home:usuals', (ctx) => {
  ctx.answerCallbackQuery();
  return handleUsuals(ctx);
});
bot.callbackQuery(/^(cafe:|rest:|item:|cust:|notes:|confirm|cancel|back:)/, handleOrderCallback);
bot.callbackQuery(/^usual:/, handleUsualCallback);

// Handle text messages (for persistent keyboard buttons, barista notes and save label)
bot.on('message:text', async (ctx, next) => {
  const text = ctx.message.text;

  // Persistent keyboard buttons
  if (text === '☕ New Order') return handleNew(ctx);
  if (text === '⭐ My Usuals') return handleUsuals(ctx);

  // Check if user is entering barista notes
  if (ctx.from) {
    const notesHandled = await handleNotesInput(ctx);
    if (notesHandled) return;
  }

  // Check if user is in "save label" flow
  if (ctx.from && hasPendingSave(ctx.from.id)) {
    const handled = await handleSaveLabel(ctx);
    if (handled) return;
  }
  await next();
});

// Error handler
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start bot
console.log('☕ SmartQ Bot starting...');
bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Bot @${botInfo.username} is running!`);
  }
});
