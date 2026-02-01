import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request) {
  try {
  const { title_id, score, review } = await request.json();
    
    if (!title_id) {
      return NextResponse.json({ error: 'Title ID required' }, { status: 400 });
    }
    
    if (score !== undefined && (score < 0 || score > 10)) {
      return NextResponse.json({ error: 'Score must be between 0 and 10' }, { status: 400 });
    }
    
  const stmt = db.prepare(`
    INSERT INTO ratings (title_id, score, review, rated_at) 
    VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
    ON CONFLICT(title_id) DO UPDATE SET score=excluded.score, review=excluded.review, rated_at=CURRENT_TIMESTAMP
  `);
    stmt.run(title_id, score ?? null, review ?? null);
  return NextResponse.json({ message: "Rating saved", title_id, score, review });
  } catch (error) {
    console.error('Error saving rating:', error);
    return NextResponse.json(
      { error: 'Failed to save rating', message: error.message },
      { status: 500 }
    );
  }
}
