import pg from 'pg'

// BIGINT (OID 20) columns -- epoch-ms timestamps, COUNT(*) -- come back from
// node-postgres as strings by default (BIGINT can exceed JS's safe integer
// range). Our values never do, so parse them back to numbers.
pg.types.setTypeParser(20, (val) => parseInt(val, 10))

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS word_sets (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS words (
      id SERIAL PRIMARY KEY,
      word_set_id INTEGER NOT NULL REFERENCES word_sets(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      meaning TEXT NOT NULL,
      is_idiom BOOLEAN NOT NULL DEFAULT false,
      part_of_speech TEXT
    );

    CREATE TABLE IF NOT EXISTS quiz_sessions (
      id SERIAL PRIMARY KEY,
      group_id TEXT NOT NULL,
      word_set_id INTEGER NOT NULL REFERENCES word_sets(id) ON DELETE CASCADE,
      word_set_title TEXT NOT NULL,
      round INTEGER NOT NULL,
      started_at BIGINT NOT NULL,
      finished_at BIGINT NOT NULL,
      duration_ms BIGINT NOT NULL,
      total_questions INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      wrong_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_answers (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      word_id INTEGER NOT NULL,
      question_type TEXT NOT NULL,
      term TEXT NOT NULL,
      meaning TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      user_answer TEXT NOT NULL,
      correct BOOLEAN NOT NULL
    );

    -- 오답 노트: 틀린 적이 있는 단어 하나당 한 줄. resolved_at이 NULL이면 아직 노트에 남아 있는 단어.
    CREATE TABLE IF NOT EXISTS wrong_notes (
      word_id INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      last_wrong_at BIGINT NOT NULL,
      last_wrong_group_id TEXT NOT NULL,
      resolved_at BIGINT
    );

    -- 오답 노트 테스트는 여러 단어장의 단어가 섞이므로 특정 단어장에 속하지 않는다.
    ALTER TABLE quiz_sessions ALTER COLUMN word_set_id DROP NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_words_word_set_id ON words(word_set_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_sessions_group_id ON quiz_sessions(group_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_sessions_started_at ON quiz_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_quiz_answers_session_id ON quiz_answers(session_id);

    -- ---- household expense tracker ----
    -- 하나의 "항목"(예: 현대카드, 월급, 인터넷+TV)이 매달 하나의 금액을 가진다.
    -- group_type으로 카드값/고정비·저축/통신·공과/기타지출/수입을 구분해 통계에서 묶어 낸다.
    CREATE TABLE IF NOT EXISTS expense_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      group_type TEXT NOT NULL CHECK (group_type IN ('income', 'fixed', 'card', 'utility', 'variable')),
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      archived_at BIGINT
    );

    -- 카드값처럼 같은 항목이라도 매달 금액이 달라지는 것과, 월급처럼 매달 들어오는 것 모두
    -- category_id + year + month 한 줄로 표현한다.
    -- 보통은 카테고리당 월 하나에 금액 한 줄이지만("추가 지출액"처럼 품목별로 여러 줄을 쌓는
    -- 카테고리도 있어서(각 줄이 memo=품목명 하나) UNIQUE 제약은 두지 않는다. 한 줄짜리 카테고리의
    -- "값 하나만 유지" 규칙은 서버(교체 후 삽입)에서 지킨다.
    CREATE TABLE IF NOT EXISTS expense_entries (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      amount BIGINT NOT NULL DEFAULT 0,
      memo TEXT,
      updated_at BIGINT NOT NULL
    );

    -- "전달 남은 돈"처럼 이월 잔액을 계산하려면 기록이 시작되기 전 시점의 잔액(기준점)이 필요하다.
    -- 앱 전체에 하나만 있으므로 id=1 고정.
    CREATE TABLE IF NOT EXISTS expense_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      opening_year INTEGER NOT NULL,
      opening_month INTEGER NOT NULL CHECK (opening_month BETWEEN 1 AND 12),
      opening_balance BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_expense_categories_group_type ON expense_categories(group_type);
    CREATE INDEX IF NOT EXISTS idx_expense_entries_year_month ON expense_entries(year, month);
    CREATE INDEX IF NOT EXISTS idx_expense_entries_category_id ON expense_entries(category_id);

    -- 기존 DB에 남아있던 "카테고리당 월 하나" UNIQUE 제약을 제거한다(품목별 다중 입력을 허용하기 위해).
    ALTER TABLE expense_entries DROP CONSTRAINT IF EXISTS expense_entries_category_id_year_month_key;

    -- OPIC 스크립트 암기장. 원본은 사용자가 관리하는 엑셀이고 여기는 그 사본이다.
    -- 임포트가 지우고 다시 넣는 방식이라 시트명을 대조용으로 들고 있을 필요가 없다.
    CREATE TABLE IF NOT EXISTS opic_topics (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      stars INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL CHECK (kind IN ('topic', 'roleplay')),
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opic_questions (
      id SERIAL PRIMARY KEY,
      topic_id INTEGER NOT NULL REFERENCES opic_topics(id) ON DELETE CASCADE,
      set_label TEXT,
      seq INTEGER NOT NULL,
      level TEXT,
      title_ko TEXT NOT NULL,
      alt_titles TEXT[] NOT NULL DEFAULT '{}',
      importance INTEGER NOT NULL DEFAULT 0,
      question_en TEXT NOT NULL DEFAULT '',
      answer_en TEXT NOT NULL,
      -- 엑셀에서 고칠 때 찾아갈 좌표. 'Hotel★★!C2' 형태.
      source_ref TEXT NOT NULL,
      -- 같은 영어 질문이 다른 주제에도 있는 경우. 시트 간 복사 실수를 찾는 실마리다.
      shared_question BOOLEAN NOT NULL DEFAULT FALSE,
      answer_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    -- 암기 상태는 문항 id가 아니라 답변 본문 해시에 붙인다. 본문이 같은 문항이 63종 있어
    -- 상태를 공유해야 하고, 엑셀을 고쳐 재임포트해도 id와 무관하게 남는다.
    CREATE TABLE IF NOT EXISTS opic_status (
      answer_hash TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('weak', 'ok', 'done')),
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opic_patterns (
      text TEXT PRIMARY KEY,
      topic_count INTEGER NOT NULL,
      occurrences INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_opic_questions_topic ON opic_questions(topic_id, seq);
    CREATE INDEX IF NOT EXISTS idx_opic_questions_hash ON opic_questions(answer_hash);
  `)

  // 오답 노트 기능 이전의 틀린 기록으로 노트를 채운다. 이미 노트에 있는 단어는 건드리지 않는다.
  // 실패해도 서버 시작을 막지 않는다.
  try {
    await pool.query(`
      INSERT INTO wrong_notes (word_id, wrong_count, last_wrong_at, last_wrong_group_id)
      SELECT a.word_id,
             COUNT(*)::int,
             MAX(s.finished_at),
             (ARRAY_AGG(s.group_id ORDER BY s.finished_at DESC))[1]
      FROM quiz_answers a
      JOIN quiz_sessions s ON s.id = a.session_id
      WHERE a.correct = false AND a.word_id IN (SELECT id FROM words)
      GROUP BY a.word_id
      ON CONFLICT (word_id) DO NOTHING
    `)
  } catch (err) {
    console.error('wrong_notes backfill failed (continuing)', err)
  }

  // 같은 라운드가 중복 저장된 예전 기록 때문에 부풀려진 오답 노트의 틀린 횟수를, 중복을
  // 뺀(가장 먼저 저장된 것만) 기록 기준으로 다시 맞춘다. 원본 기록은 건드리지 않고, 몇 번을
  // 실행해도 같은 결과가 나온다. 실패해도 서버 시작을 막지 않는다.
  try {
    await pool.query(`
      UPDATE wrong_notes n SET wrong_count = c.cnt
      FROM (
        SELECT a.word_id, COUNT(*)::int AS cnt
        FROM quiz_answers a
        JOIN quiz_sessions s ON s.id = a.session_id
        WHERE a.correct = false
          AND s.id = (SELECT MIN(d.id) FROM quiz_sessions d WHERE d.group_id = s.group_id AND d.round = s.round)
        GROUP BY a.word_id
      ) c
      WHERE n.word_id = c.word_id AND n.wrong_count <> c.cnt
    `)
  } catch (err) {
    console.error('wrong_notes recount failed (continuing)', err)
  }
}
