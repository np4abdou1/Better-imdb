import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'List ID required' }, { status: 400 });
    }
    
    // Verify list ownership
    const list = db.prepare('SELECT user_id FROM lists WHERE id = ?').get(id);
    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }
    
    if (list.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { title_id } = await request.json();
      
    if (!id) {
      return NextResponse.json({ error: 'List ID required' }, { status: 400 });
    }
    
    if (!title_id) {
      return NextResponse.json({ error: 'Title ID required' }, { status: 400 });
    }
    
    // Check if list exists and belongs to user
    const listCheck = db.prepare('SELECT id, user_id FROM lists WHERE id = ?').get(id);
    if (!listCheck) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }
    
    if (listCheck.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const titleId = body?.title_id;
    const clear = body?.clear === true;

    if (!id) {
      return NextResponse.json({ error: 'List ID required' }, { status: 400 });
    }

    const listCheck = db.prepare('SELECT id, user_id FROM lists WHERE id = ?').get(id);
    if (!listCheck) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    if (listCheck.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!clear && !titleId) {
      return NextResponse.json({ error: 'Title ID or clear flag required' }, { status: 400 });
    }

    let info;
    if (clear) {
      info = db.prepare('DELETE FROM list_items WHERE list_id = ?').run(id);
    } else {
      info = db.prepare('DELETE FROM list_items WHERE list_id = ? AND title_id = ?').run(id, titleId);
    }

    return NextResponse.json({
      success: true,
      deleted: info.changes,
      list_id: id,
      title_id: titleId || null
    });
  } catch (error) {
    console.error('Error removing list item:', error);
    return NextResponse.json(
      { error: 'Failed to remove item from list', message: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { title_id, target_list_id } = await request.json();

    if (!id || !title_id || !target_list_id) {
      return NextResponse.json({ error: 'List ID, title ID, and target list ID required' }, { status: 400 });
    }

    const source = db.prepare('SELECT id, user_id FROM lists WHERE id = ?').get(id);
    const target = db.prepare('SELECT id, user_id FROM lists WHERE id = ?').get(target_list_id);

    if (!source || !target) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    if (source.user_id !== session.user.id || target.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const existingTarget = db.prepare('SELECT id FROM list_items WHERE list_id = ? AND title_id = ?')
      .get(target_list_id, title_id);

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM list_items WHERE list_id = ? AND title_id = ?').run(id, title_id);
      if (!existingTarget) {
        db.prepare('INSERT INTO list_items (list_id, title_id) VALUES (?, ?)').run(target_list_id, title_id);
      }
    });

    tx();

    return NextResponse.json({
      success: true,
      moved: true,
      list_id: id,
      target_list_id,
      title_id
    });
  } catch (error) {
    console.error('Error moving list item:', error);
    return NextResponse.json(
      { error: 'Failed to move item', message: error.message },
      { status: 500 }
    );
  }
}
