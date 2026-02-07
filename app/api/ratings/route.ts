import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

// GET user ratings
export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    // Always filter by user_id
    const ratings = await db.collection('ratings')
        .find({ user_id: session.user.id })
        .sort({ rated_at: -1 })
        .toArray();
        
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
    
    const db = await getDb();
    
    await db.collection('ratings').updateOne(
        { user_id: session.user.id, title_id },
        { 
            $set: { 
                score: score ?? null, 
                review: review ?? null, 
                rated_at: new Date() 
            }
        },
        { upsert: true }
    );
    
    return NextResponse.json({ message: "Rating saved", title_id, score, review });
  } catch (error) {
    console.error('Error saving rating:', error);
    return NextResponse.json(
      { error: 'Failed to save rating', message: error.message },
      { status: 500 }
    );
  }
}
