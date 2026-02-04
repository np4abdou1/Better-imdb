import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { auth } from '@/auth';

// GET user ratings
export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Always filter by user_id
    const ratings = db.prepare('SELECT title_id, score, review, rated_at FROM ratings WHERE user_id = ? ORDER BY rated_at DESC').all(session.user.id);
    return NextResponse.json({ ratings });
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ratings', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title_id, score, review } = await request.json();
    
    if (!title_id) {
      return NextResponse.json({ error: 'Title ID required' }, { status: 400 });
    }
    
    if (score !== undefined && (score < 0 || score > 10)) {
      return NextResponse.json({ error: 'Score must be between 0 and 10' }, { status: 400 });
    }
    
    // User-scoped upsert
    // Note: Primary Key is (user_id, title_id)
    const stmt = db.prepare(`
      INSERT INTO ratings (user_id, title_id, score, review, rated_at) 
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) 
      ON CONFLICT(user_id, title_id) DO UPDATE SET score=excluded.score, review=excluded.review, rated_at=CURRENT_TIMESTAMP
    `);
    
    stmt.run(session.user.id, title_id, score ?? null, review ?? null);
    
    return NextResponse.json({ message: "Rating saved", title_id, score, review });
  } catch (error) {
    console.error('Error saving rating:', error);
    return NextResponse.json(
      { error: 'Failed to save rating', message: error.message },
      { status: 500 }
    );
  }
}
