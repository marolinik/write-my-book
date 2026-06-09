import pg from 'pg';
console.log('pg imported');
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/writemybook?schema=public' });
const res = await pool.query('SELECT COUNT(*) as cnt FROM books');
console.log('books:', res.rows[0].cnt);
const chRes = await pool.query("SELECT chapter_number, title, status FROM chapters WHERE book_id='b6b3e176-1788-4230-93ea-f22c3d6dc475' ORDER BY chapter_number");
chRes.rows.forEach(r => console.log(`Ch.${r.chapter_number}: ${r.title} (${r.status})`));
pool.end();
