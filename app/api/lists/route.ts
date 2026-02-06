import { NextResponse, NextRequest } from 'next/server';
import db, { createUser, getUserByEmail } from '@/lib/db';
import { auth } from '@/auth';

const defaultLists = ['Watched', 'Watching', 'To Watch', 'Favorites'];

function resolveUserId(session) {
  let userId = session.user.id;
  const user = getUserByEmail(session.user.email);

  if (user) {
    userId = user.id;
  } else {
    // Self-healing: Create user if missing
    createUser({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image
    });
    const insertList = db.prepare('INSERT INTO lists (user_id, name) VALUES (?, ?)');
    defaultLists.forEach(name => insertList.run(session.user.id, name));
  }

  return userId;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = resolveUserId(session);
    const searchParams = request.nextUrl.searchParams;
    const containsTitleId = searchParams.get('contains');

    if (containsTitleId) {
      const stmt = db.prepare(`
        SELECT l.*, EXISTS(SELECT 1 FROM list_items li WHERE li.list_id = l.id AND li.title_id = ?) as has_title 
        FROM lists l 
        WHERE user_id = ? 
        ORDER BY created_at ASC
      `);
      const rows = stmt.all(containsTitleId, userId);
      return NextResponse.json(rows);
    } else {
      const stmt = db.prepare('SELECT * FROM lists WHERE user_id = ? ORDER BY created_at ASC');
      const rows = stmt.all(userId);
      return NextResponse.json(rows);
    }
  } catch (error) {
    console.error('Error fetching lists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lists', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await request.json();
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'List name is required' }, { status: 400 });
    }

    const userId = resolveUserId(session);
    
    // Check if list with same name exists for this user
    const existingList = db.prepare('SELECT id FROM lists WHERE user_id = ? AND name = ?').get(userId, name.trim());
    if (existingList) {
       return NextResponse.json(
        { error: 'A list with this name already exists' },
        { status: 409 }
      );
    }
    
    const stmt = db.prepare('INSERT INTO lists (name, user_id) VALUES (?, ?)');
    const info = stmt.run(name.trim(), userId);
    return NextResponse.json({ id: info.lastInsertRowid, name: name.trim(), user_id: userId });
  } catch (error) {
    console.error('Error creating list:', error);
    
    // Handle unique constraint violation (scoped to user/name if we had a constraint, currently schema might not enforce user-scope unique perfectly unless index is unique)
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

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, name } = await request.json();
    if (!id && !name) {
      return NextResponse.json({ error: 'List id or name required' }, { status: 400 });
    }

    const userId = resolveUserId(session);

    let listId = id;
    if (!listId && name) {
      const list = db.prepare('SELECT id FROM lists WHERE user_id = ? AND name = ?').get(userId, name.trim()) as { id: number } | undefined;
      if (!list) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 });
      }
      listId = list.id;
    }

    const info = db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(listId, userId);
    if (info.changes === 0) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: info.changes });
  } catch (error) {
    console.error('Error deleting list:', error);
    return NextResponse.json(
      { error: 'Failed to delete list', message: error.message },
      { status: 500 }
    );
  }
}
