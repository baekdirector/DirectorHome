// 검수를 통과한 임포트 데이터를 Postgres에 넣는다.
// opic_status는 건드리지 않는다(answer_hash로 다시 붙는다).
import pg from 'pg'

export async function applyImport({ topics, questions, patterns }) {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL이 필요합니다')
  const pool = new pg.Pool({ connectionString })
  const client = await pool.connect()
  const now = Date.now()

  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM opic_questions')
    await client.query('DELETE FROM opic_topics')
    await client.query('DELETE FROM opic_patterns')

    const idBySheet = new Map()
    for (const t of topics) {
      const r = await client.query(
        `INSERT INTO opic_topics (name, stars, kind, display_order, created_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [t.name, t.stars, t.kind, t.displayOrder, now],
      )
      idBySheet.set(t.sheetName, r.rows[0].id)
    }

    for (const q of questions) {
      await client.query(
        `INSERT INTO opic_questions
           (topic_id, set_label, seq, level, title_ko, alt_titles, importance,
            question_en, answer_en, source_ref, shared_question, answer_hash, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          idBySheet.get(q.sheetName),
          q.setLabel,
          q.seq,
          q.level,
          q.titleKo,
          q.altTitles,
          q.importance,
          q.questionEn,
          q.answerEn,
          q.sourceRef,
          Boolean(q.sharedQuestion),
          q.answerHash,
          now,
        ],
      )
    }

    for (const p of patterns) {
      await client.query(
        `INSERT INTO opic_patterns (text, topic_count, occurrences) VALUES ($1,$2,$3)`,
        [p.text, p.topicCount, p.occurrences],
      )
    }

    await client.query('COMMIT')
    console.log(`반영 완료 — 주제 ${topics.length} · 문항 ${questions.length} · 패턴 ${patterns.length}`)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}
