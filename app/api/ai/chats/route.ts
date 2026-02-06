import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import db from '@/lib/db';
import { randomUUID } from 'crypto';

export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    console.warn('GET /chats: No session user ID');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const chats = db.prepare(`
      SELECT id, user_id, title, created_at, updated_at
      FROM ai_chats 
      WHERE user_id = ? 
      ORDER BY updated_at DESC
      LIMIT 50
    `).all(session.user.id) as any[];

    console.log('GET /chats: Retrieved chats', { userId: session.user.id, count: chats.length });

    // Add message preview to each chat
    const chatsWithPreview = chats.map(chat => {
      const lastMessage = db.prepare(`
        SELECT role, content FROM ai_messages
        WHERE chat_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(chat.id) as { content?: string } | undefined;

      return {
        ...chat,
        preview: lastMessage?.content?.substring(0, 100) || 'No messages yet'
      };
    });

    return NextResponse.json(chatsWithPreview);
  } catch (error) {
    console.error('Error fetching chats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { title } = await req.json();
    const id = randomUUID();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO ai_chats (id, user_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, session.user.id, title || 'New Chat', now, now);

    return NextResponse.json({ 
      id, 
      title: title || 'New Chat',
      created_at: now,
      updated_at: now
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating chat:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
