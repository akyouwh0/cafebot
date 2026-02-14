# ☕ SmartQ Cafe Bot

Telegram bot for ordering drinks from SmartQ office cafes.

## Features

- 🏪 Order from multiple cafes (Seven Seeds, Kaapi Vibe, Chai Maadi, etc.)
- ☕ Full menu with customizations (milk, caffeine, hot/iced)
- ⭐ Save favorite orders for quick reordering
- 📱 Clean Telegram inline keyboard interface
- 🔄 Live menu fetching from SmartQ API

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file:
   ```
   BOT_TOKEN=your_telegram_bot_token
   ```

3. Create `src/config/session.json` from the example:
   ```bash
   cp src/config/session.example.json src/config/session.json
   ```
   Fill in your SmartQ cookies (get them from browser dev tools).

4. Build and run:
   ```bash
   npm run build
   npm start
   ```

## Commands

- `/new` - Start a new order
- `/usuals` - View and order saved favorites
- `/stats` - View order statistics

## Development

```bash
npm run dev    # Run with ts-node
npm run build  # Compile TypeScript
npm start      # Run compiled JS
```

## Tech Stack

- TypeScript
- Grammy (Telegram Bot Framework)
- better-sqlite3 (Database)
- SmartQ API (Direct integration)

## License

MIT
