import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request, { params }) {
  try {
  const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'List ID required' }, { status: 400 });
    }
    
    const stmt = db.prepare('SELECT * FROM list_items WHERE list_id = ? ORDER BY added_at DESC');
  const rows = stmt.all(id);
  return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching list items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch list items', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
  const { id } = await params;
  const { title_id } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: 'List ID required' }, { status: 400 });
    }
    
    if (!title_id) {
      return NextResponse.json({ error: 'Title ID required' }, { status: 400 });
    }
    
    // Check if list exists
    const listCheck = db.prepare('SELECT id FROM lists WHERE id = ?').get(id);
    if (!listCheck) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }
    
    // Check if item already exists in list
    const existing = db.prepare('SELECT id FROM list_items WHERE list_id = ? AND title_id = ?').get(id, title_id);
    if (existing) {
      return NextResponse.json(
        { error: 'Item already in list', id: existing.id, list_id: id, title_id },
        { status: 409 }
      );
    }
    
  const stmt = db.prepare('INSERT INTO list_items (list_id, title_id) VALUES (?, ?)');
  const info = stmt.run(id, title_id);
  return NextResponse.json({ id: info.lastInsertRowid, list_id: id, title_id });
  } catch (error) {
    console.error('Error adding list item:', error);
    return NextResponse.json(
      { error: 'Failed to add item to list', message: error.message },
      { status: 500 }
    );
  }
}
