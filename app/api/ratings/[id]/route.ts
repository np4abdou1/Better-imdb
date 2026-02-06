import { NextResponse } from 'next/server';
import db, { getUserByEmail } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Title ID required' }, { status: 400 });
    }
    
    let userId = session.user.id;
    if (session.user.email) {
      const user = getUserByEmail(session.user.email);
      if (user) userId = user.id;
    }

    const stmt = db.prepare('SELECT * FROM ratings WHERE user_id = ? AND title_id = ?');
    const row = stmt.get(userId, id);
    return NextResponse.json(row || null);
  } catch (error) {
    console.error('Error fetching rating:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rating', message: error.message },
      { status: 500 }
    );
  }
}
