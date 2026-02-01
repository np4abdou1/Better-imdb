import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const stmt = db.prepare('SELECT * FROM lists ORDER BY created_at ASC');
  const rows = stmt.all();
  return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching lists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lists', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
  const { name } = await request.json();
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'List name is required' }, { status: 400 });
    }
    
  const stmt = db.prepare('INSERT INTO lists (name) VALUES (?)');
    const info = stmt.run(name.trim());
    return NextResponse.json({ id: info.lastInsertRowid, name: name.trim() });
  } catch (error) {
    console.error('Error creating list:', error);
    
    // Handle unique constraint violation
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json(
        { error: 'A list with this name already exists' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create list', message: error.message },
      { status: 500 }
    );
  }
}
