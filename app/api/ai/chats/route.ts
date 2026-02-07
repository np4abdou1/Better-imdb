import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    console.warn('GET /chats: No session user ID');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const chats = await db.collection('ai_chats')
        .find({ user_id: session.user.id })
        .sort({ updated_at: -1 })
        .limit(50)
        .toArray();

    // Add message preview to each chat
    const chatsWithPreview = await Promise.all(chats.map(async chat => {
      const lastMessage = await db.collection('ai_messages')
        .find({ chat_id: chat._id }) // Assuming chat id is stored in _id
        .sort({ created_at: -1 })
        .limit(1)
        .next(); // get first document

      return {
        ...chat,
        id: chat._id.toString(), // Map _id to id if it's not string
        preview: lastMessage?.content?.substring(0, 100) || 'No messages yet'
      };
    }));

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
    const id = randomUUID(); // Use UUID as _id for consistency with existing references
    const now = new Date();
    
    const db = await getDb();
    await db.collection('ai_chats').insertOne({
        _id: id as any,
        user_id: session.user.id,
        title: title || 'New Chat',
        created_at: now,
        updated_at: now
    });

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
