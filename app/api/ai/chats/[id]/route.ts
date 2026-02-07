import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';

export async function GET(req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const db = await getDb();
    const chat = await db.collection('ai_chats').findOne({ _id: id, user_id: session.user.id });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({ ...chat, id: chat._id });
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
    const db = await getDb();
    const chat = await db.collection('ai_chats').findOne({ _id: id, user_id: session.user.id });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Delete messages first
    await db.collection('ai_messages').deleteMany({ chat_id: id });
    
    // Delete chat
    await db.collection('ai_chats').deleteOne({ _id: id });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
