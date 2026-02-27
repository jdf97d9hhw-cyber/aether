# Настройка Supabase для системы лайков

## Шаги настройки:

### 1. Создайте проект в Supabase
1. Перейдите на https://supabase.com
2. Создайте новый проект (или используйте существующий)
3. Запишите URL проекта и Anon Key из настроек проекта

### 2. Создайте таблицу в базе данных

В SQL Editor Supabase выполните следующий SQL:

```sql
-- Создать таблицу для хранения лайков
CREATE TABLE IF NOT EXISTS likes (
  id BIGSERIAL PRIMARY KEY,
  track_id TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Создать индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_likes_track_id ON likes(track_id);

-- Включить Row Level Security (RLS)
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- Политика: разрешить всем читать лайки
CREATE POLICY "Anyone can read likes"
  ON likes FOR SELECT
  USING (true);

-- Политика: разрешить всем вставлять/обновлять лайки
CREATE POLICY "Anyone can insert likes"
  ON likes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update likes"
  ON likes FOR UPDATE
  USING (true);
```

### 3. Обновите конфигурацию в script.js

Откройте файл `js/script.js` и найдите строки:

```javascript
const SUPABASE_URL = 'TU_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'TU_SUPABASE_ANON_KEY';
```

Замените их на ваши реальные значения:

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co'; // Ваш URL проекта
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Ваш Anon Key
```

### 4. Готово!

После настройки система лайков будет работать автоматически:
- Лайки сохраняются в Supabase
- Если Supabase не настроен, используется localStorage как fallback
- Кнопка лайка появляется в правом верхнем углу каждой карточки сессии
- При клике счетчик увеличивается и сохраняется навсегда

## Примечания:

- Каждый трек идентифицируется комбинацией `title + artist`
- Лайки синхронизируются между всеми пользователями через Supabase
- Если Supabase не настроен, лайки сохраняются локально в браузере (localStorage)
