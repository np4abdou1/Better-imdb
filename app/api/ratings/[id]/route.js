import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request, { params }) {
  try {
  const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Title ID required' }, { status: 400 });
    }
    
  const stmt = db.prepare('SELECT * FROM ratings WHERE title_id = ?');
  const row = stmt.get(id);
  return NextResponse.json(row || null);
  } catch (error) {
    console.error('Error fetching rating:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rating', message: error.message },
      { status: 500 }
    );
  }
}
