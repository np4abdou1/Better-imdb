import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import db from '@/lib/db';

export async function GET(req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    console.warn('GET /chats/[id]: No session user ID');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  console.log('GET /chats/[id]: Fetching chat', { id, userId: session.user.id });

  try {
    const chat = db.prepare('SELECT * FROM ai_chats WHERE id = ? AND user_id = ?').get(id, session.user.id);
    if (!chat) {
      console.warn('GET /chats/[id]: Chat not found for user', { id, userId: session.user.id });
      // Log all chats for this user for debugging
      const userChats = db.prepare('SELECT id, title FROM ai_chats WHERE user_id = ?').all(session.user.id);
      console.warn('User chats:', userChats);
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const messages = db.prepare(`
      SELECT id, chat_id, role, content, created_at FROM ai_messages 
      WHERE chat_id = ? 
      ORDER BY created_at ASC
    `).all(id);

    return NextResponse.json({ chat, messages });
  } catch (error) {
    console.error('Error fetching chat:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = db.prepare('DELETE FROM ai_chats WHERE id = ? AND user_id = ?').run(id, session.user.id);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { title } = await req.json();

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();
    const result = db.prepare(
      'UPDATE ai_chats SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(title.trim(), now, id, session.user.id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, title: title.trim(), updated_at: now });
  } catch (error) {
    console.error('Error updating chat:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
