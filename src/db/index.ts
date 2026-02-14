import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/bot.db');
const db = new Database(DB_PATH);

// Initialize schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// User operations
export function getOrCreateUser(telegramId: number, telegramName: string) {
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (existing) {
    db.prepare("UPDATE users SET telegram_name = ?, updated_at = datetime('now') WHERE telegram_id = ?")
      .run(telegramName, telegramId);
    return existing;
  }
  db.prepare('INSERT INTO users (telegram_id, telegram_name) VALUES (?, ?)')
    .run(telegramId, telegramName);
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

// Usual orders
export interface UsualOrder {
  id: number;
  telegram_id: number;
  label: string;
  cafe_id: string;
  cafe_name: string;
  restaurant_id: string;
  restaurant_name: string;
  food_id: string;
  food_name: string;
  customizations: string | null;
  notes: string | null;
  created_at: string;
}

export function getUserUsuals(telegramId: number): UsualOrder[] {
  return db.prepare('SELECT * FROM usual_orders WHERE telegram_id = ? ORDER BY created_at DESC')
    .all(telegramId) as UsualOrder[];
}

export function getUsualById(id: number): UsualOrder | undefined {
  return db.prepare('SELECT * FROM usual_orders WHERE id = ?').get(id) as UsualOrder | undefined;
}

export function saveUsualOrder(
  telegramId: number,
  label: string,
  cafeId: string,
  cafeName: string,
  restaurantId: string,
  restaurantName: string,
  foodId: string,
  foodName: string,
  customizations?: Record<string, string>,
  notes?: string
): number {
  const result = db.prepare(`
    INSERT INTO usual_orders 
    (telegram_id, label, cafe_id, cafe_name, restaurant_id, restaurant_name, food_id, food_name, customizations, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    telegramId,
    label,
    cafeId,
    cafeName,
    restaurantId,
    restaurantName,
    foodId,
    foodName,
    customizations ? JSON.stringify(customizations) : null,
    notes || null
  );
  return result.lastInsertRowid as number;
}

export function deleteUsualOrder(id: number, telegramId: number): boolean {
  const result = db.prepare('DELETE FROM usual_orders WHERE id = ? AND telegram_id = ?')
    .run(id, telegramId);
  return result.changes > 0;
}

// Order logging (for stats)
export function logOrder(
  telegramId: number,
  cafeId: string,
  foodName: string,
  orderId?: string
) {
  db.prepare(`
    INSERT INTO order_log (telegram_id, order_id, cafe_id, food_name, status)
    VALUES (?, ?, ?, ?, 'placed')
  `).run(telegramId, orderId || null, cafeId, foodName);
}

export function getStats() {
  const totalUsers = db.prepare('SELECT COUNT(DISTINCT telegram_id) as count FROM order_log').get() as { count: number };
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM order_log').get() as { count: number };
  return {
    uniqueUsers: totalUsers.count,
    totalOrders: totalOrders.count
  };
}

export default db;
