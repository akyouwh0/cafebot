-- SmartQ Bot Database Schema

CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  telegram_name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usual_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  cafe_id TEXT NOT NULL,
  cafe_name TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  food_id TEXT NOT NULL,
  food_name TEXT NOT NULL,
  customizations TEXT, -- JSON: {"Caffeine option": "Regular", "Milk option": "Dairy"}
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

CREATE TABLE IF NOT EXISTS order_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  order_id TEXT,
  cafe_id TEXT NOT NULL,
  food_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_usual_orders_user ON usual_orders(telegram_id);
CREATE INDEX IF NOT EXISTS idx_order_log_user ON order_log(telegram_id);
CREATE INDEX IF NOT EXISTS idx_order_log_date ON order_log(created_at);
