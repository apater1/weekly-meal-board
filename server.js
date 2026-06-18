import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'menu.db');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const schemaVersion = '4';
const scheduleYear = new Date().getFullYear();

const cycleMeals = [
  {
    breakfast: 'Oatmeal with banana and peanut butter',
    lunch: 'Φακές.',
    dinner: 'Τσιπούρα με πατάτες στο φούρνο, arugula με τομάτες και αγγούρι.',
  },
  {
    breakfast: 'Greek yogurt with berries and granola',
    lunch: 'Leftover chicken bowl',
    dinner: 'Spaghetti with marinara and side salad',
  },
  {
    breakfast: 'Scrambled eggs and toast',
    lunch: 'Hummus, cucumber, and pita',
    dinner: 'Taco bowls with rice, beans, and ground turkey',
  },
  {
    breakfast: 'Smoothie with spinach, banana, and yogurt',
    lunch: 'Leftover taco bowl',
    dinner: 'Beef burger, cheese, tomatoes, onions in brioche bread.',
  },
  {
    breakfast: 'Overnight oats with apple and cinnamon',
    lunch: 'Gigantes (leftovers)',
    dinner: 'Κολοκυθόπιτα με πράσινο κολοκύθι.',
  },
  {
    breakfast: 'Eggs, fruit, and toast',
    lunch: 'Leftover stir-fry',
    dinner: 'Homemade pizza with salad',
  },
  {
    breakfast: 'Pancakes and fruit',
    lunch: 'Soup and grilled cheese',
    dinner: 'Roast chicken, carrots, and mashed potatoes',
  },
  {
    breakfast: 'Oatmeal with berries',
    lunch: 'Κοτόπουλο με πράσινα φασολάκια και πατάτες στην κατσαρόλα.',
    dinner: 'Τσιπούρες.',
  },
  {
    breakfast: 'Omelette, almonds, croissants.',
    lunch: 'Κοτόπουλο με πράσινα φασολάκια και πατάτες στην κατσαρόλα. (leftovers)',
    dinner: 'Σουβλάκια κοτόπουλο και τηγανιτές πατάτες.',
  },
  {
    breakfast: 'Avocado toast with eggs',
    lunch: 'Leftover turkey burger salad',
    dinner: 'Pasta primavera with chicken or shrimp',
  },
  {
    breakfast: 'Smoothie and toast',
    lunch: 'Tuna salad wrap',
    dinner: 'Chili with cornbread',
  },
  {
    breakfast: 'Overnight oats',
    lunch: 'Leftover chili',
    dinner: 'Baked cod, rice, and asparagus',
  },
  {
    breakfast: 'Breakfast burrito',
    lunch: 'Veggie and cheese quesadilla',
    dinner: 'Beef or bean fajitas',
  },
  {
    breakfast: 'French toast and fruit',
    lunch: 'Leftover fajitas',
    dinner: 'Big salad with protein and crusty bread',
  },
];

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  timeZone: 'UTC',
});

const generateYearSchedule = (year) => {
  const days = [];
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);

  for (let index = 0, timestamp = start; timestamp < end; timestamp += 86_400_000, index += 1) {
    const date = new Date(timestamp);
    const cycle = cycleMeals[index % cycleMeals.length];
    const mealDate = date.toISOString().slice(0, 10);

    days.push({
      week_number: Math.floor(index / 7) + 1,
      day_number: index + 1,
      day_name: weekdayFormatter.format(date),
      meal_date: mealDate,
      breakfast: cycle.breakfast,
      lunch: cycle.lunch,
      dinner: cycle.dinner,
    });
  }

  return days;
};

await mkdir(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);

const ensureTables = () => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const currentVersion = db.prepare(`SELECT value FROM app_meta WHERE key = ?`).get('schema_version')?.value;
  const storedYear = db.prepare(`SELECT value FROM app_meta WHERE key = ?`).get('schedule_year')?.value;

  db.exec(`
    CREATE TABLE IF NOT EXISTS meal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_number INTEGER NOT NULL,
      day_number INTEGER NOT NULL UNIQUE,
      day_name TEXT NOT NULL,
      meal_date TEXT NOT NULL,
      breakfast TEXT NOT NULL DEFAULT '',
      lunch TEXT NOT NULL DEFAULT '',
      dinner TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_entry_id INTEGER NOT NULL,
      meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner')),
      type TEXT NOT NULL CHECK (type IN ('add', 'update', 'remove')),
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT 'Anonymous',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meal_entry_id) REFERENCES meal_entries(id) ON DELETE CASCADE
    );
  `);

  db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`).run('schema_version', schemaVersion);
  db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`).run('schedule_year', String(scheduleYear));

  const count = db.prepare(`SELECT COUNT(*) AS count FROM meal_entries`).get().count;
  const schedule = generateYearSchedule(scheduleYear);
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO meal_entries (week_number, day_number, day_name, meal_date, breakfast, lunch, dinner)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN');
    try {
      for (const entry of schedule) {
        insert.run(
          entry.week_number,
          entry.day_number,
          entry.day_name,
          entry.meal_date,
          entry.breakfast,
          entry.lunch,
          entry.dinner,
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return;
  }

  if (currentVersion !== schemaVersion || storedYear !== String(scheduleYear) || count !== schedule.length) {
    const update = db.prepare(`
      UPDATE meal_entries
      SET week_number = ?, day_name = ?, meal_date = ?, breakfast = ?, lunch = ?, dinner = ?, updated_at = CURRENT_TIMESTAMP
      WHERE day_number = ?
    `);

    db.exec('BEGIN');
    try {
      for (const entry of schedule) {
        update.run(
          entry.week_number,
          entry.day_name,
          entry.meal_date,
          entry.breakfast,
          entry.lunch,
          entry.dinner,
          entry.day_number,
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
};

ensureTables();

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
]);

const sendJson = (res, statusCode, body) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const sendText = (res, statusCode, body, contentType = 'text/plain; charset=utf-8') => {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(body);
};

const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const serveStatic = (res, pathname) => {
  const resolved = pathname === '/' ? path.join(publicDir, 'index.html') : path.join(publicDir, pathname);
  const normalized = path.normalize(resolved);

  if (!normalized.startsWith(publicDir)) {
    sendText(res, 403, 'Forbidden');
    return true;
  }

  if (!existsSync(normalized)) return false;

  const contentType = mimeTypes.get(path.extname(normalized).toLowerCase()) || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(normalized).pipe(res);
  return true;
};

const mealSlotColumn = (slot) => {
  if (slot === 'breakfast' || slot === 'lunch' || slot === 'dinner') return slot;
  throw new Error('Meal slot must be breakfast, lunch, or dinner.');
};

const api = {
  '/api/schedule': {
    GET: () => {
      const days = db.prepare(`
        SELECT id, week_number, day_number, day_name, meal_date, breakfast, lunch, dinner, created_at, updated_at
        FROM meal_entries
        ORDER BY week_number, day_number
      `).all();

      return { days };
    },
  },
  '/api/suggestions': {
    GET: () => {
      const suggestions = db.prepare(`
        SELECT
          s.id,
          s.meal_entry_id,
          s.meal_slot,
          s.type,
          s.title,
          s.details,
          s.author,
          s.status,
          s.created_at,
          s.updated_at,
          m.week_number,
          m.day_number,
          m.day_name,
          m.meal_date,
          m.breakfast,
          m.lunch,
          m.dinner
        FROM suggestions s
        INNER JOIN meal_entries m ON m.id = s.meal_entry_id
        ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, s.created_at DESC
      `).all();

      return { suggestions };
    },
    POST: async (req) => {
      const body = await readJson(req);
      const mealEntryId = Number(body.meal_entry_id);
      const mealSlot = mealSlotColumn(String(body.meal_slot || '').trim());
      const type = String(body.type || 'update').trim();
      const title = String(body.title || '').trim();
      const details = String(body.details || '').trim();
      const author = String(body.author || 'Anonymous').trim() || 'Anonymous';

      if (Number.isNaN(mealEntryId)) throw new Error('meal_entry_id is required.');
      if (!['add', 'update', 'remove'].includes(type)) throw new Error('Suggestion type is invalid.');
      if (!title) throw new Error('Suggestion title is required.');

      const entry = db.prepare(`SELECT id FROM meal_entries WHERE id = ?`).get(mealEntryId);
      if (!entry) throw new Error('Selected day was not found.');

      const result = db.prepare(`
        INSERT INTO suggestions (meal_entry_id, meal_slot, type, title, details, author)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(mealEntryId, mealSlot, type, title, details, author);

      return {
        suggestion: db.prepare(`
          SELECT
            s.id,
            s.meal_entry_id,
            s.meal_slot,
            s.type,
            s.title,
            s.details,
            s.author,
            s.status,
            s.created_at,
            s.updated_at,
            m.week_number,
            m.day_number,
            m.day_name,
            m.meal_date,
            m.breakfast,
            m.lunch,
            m.dinner
          FROM suggestions s
          INNER JOIN meal_entries m ON m.id = s.meal_entry_id
          WHERE s.id = ?
        `).get(result.lastInsertRowid),
      };
    },
  },
};

const updateDay = async (req, dayId) => {
  const body = await readJson(req);
  const mealDate = String(body.meal_date || '').trim();
  const breakfast = String(body.breakfast || '').trim();
  const lunch = String(body.lunch || '').trim();
  const dinner = String(body.dinner || '').trim();

  if (!mealDate) throw new Error('Date is required.');

  const result = db.prepare(`
    UPDATE meal_entries
    SET meal_date = ?, breakfast = ?, lunch = ?, dinner = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(mealDate, breakfast, lunch, dinner, dayId);

  if (result.changes === 0) throw new Error('Schedule day not found.');

  return {
    day: db.prepare(`
      SELECT id, week_number, day_number, day_name, meal_date, breakfast, lunch, dinner, created_at, updated_at
      FROM meal_entries
      WHERE id = ?
    `).get(dayId),
  };
};

const updateSuggestion = async (req, suggestionId) => {
  const body = await readJson(req);
  const status = String(body.status || '').trim();

  if (!['pending', 'accepted', 'rejected'].includes(status)) throw new Error('Suggestion status is invalid.');

  const result = db.prepare(`
    UPDATE suggestions
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, suggestionId);

  if (result.changes === 0) throw new Error('Suggestion not found.');

  return { ok: true };
};

const applySuggestion = (suggestionId) => {
  const suggestion = db.prepare(`
    SELECT id, meal_entry_id, meal_slot, type, title
    FROM suggestions
    WHERE id = ?
  `).get(suggestionId);

  if (!suggestion) throw new Error('Suggestion not found.');

  const column = mealSlotColumn(suggestion.meal_slot);
  const nextValue = suggestion.type === 'remove' ? '' : suggestion.title;

  db.prepare(`
    UPDATE meal_entries
    SET ${column} = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextValue, suggestion.meal_entry_id);

  db.prepare(`
    UPDATE suggestions
    SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(suggestionId);

  return { ok: true };
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/schedule' && req.method in api['/api/schedule']) {
        sendJson(res, 200, api['/api/schedule'][req.method]());
        return;
      }

      if (pathname === '/api/suggestions' && req.method in api['/api/suggestions']) {
        const result = await api['/api/suggestions'][req.method](req);
        sendJson(res, 200, result);
        return;
      }

      const dayMatch = pathname.match(/^\/api\/schedule\/(\d+)$/);
      if (dayMatch && req.method === 'PUT') {
        sendJson(res, 200, await updateDay(req, Number(dayMatch[1])));
        return;
      }

      const suggestionMatch = pathname.match(/^\/api\/suggestions\/(\d+)$/);
      if (suggestionMatch && req.method === 'PATCH') {
        sendJson(res, 200, await updateSuggestion(req, Number(suggestionMatch[1])));
        return;
      }

      const applyMatch = pathname.match(/^\/api\/suggestions\/(\d+)\/apply$/);
      if (applyMatch && req.method === 'POST') {
        sendJson(res, 200, applySuggestion(Number(applyMatch[1])));
        return;
      }

      sendText(res, 404, 'Not found');
      return;
    }

    const served = serveStatic(res, pathname === '/' ? '/index.html' : pathname);
    if (!served) sendText(res, 404, 'Not found');
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'Something went wrong.' });
  }
});

server.listen(port, host, () => {
  console.log(`Weekly meal board is running on http://localhost:${port}`);
});
