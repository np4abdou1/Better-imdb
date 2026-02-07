import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import ChatInterface from '@/components/ai/ChatInterface';
import { ObjectId } from 'mongodb';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return notFound();

  const { id } = await params;
  
  try {
    const db = await getDb();
    
    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
        return notFound();
    }
    
    const query = { 
        _id: new ObjectId(id),
        user_id: session.user.id
    };

    const chat = await db.collection('ai_chats').findOne(query);
                                                      
    if (!chat) return notFound();
    
    // Fetch messages
    // Messages store chat_id as string (from create route)
    const rawMessages = await db.collection('ai_messages')
        .find({ chat_id: id })
        .sort({ created_at: 1 })
        .toArray();

    const messages = rawMessages.map(m => ({
        ...m,
        _id: m._id.toString(),
        id: m._id.toString()
    }));
    
    return (
      <ChatInterface 
        chatId={id} 
        initialMessages={messages} 
        initialTitle={chat.title || 'New Chat'} 
      />
    );
  } catch (e) {
      console.error("Error loading chat:", e);
      return notFound();
  }
}
