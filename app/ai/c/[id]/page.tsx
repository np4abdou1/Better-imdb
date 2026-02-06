import db from '@/lib/db';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import ChatInterface from '@/components/ai/ChatInterface';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return notFound();

  const { id } = await params;
  
  const chat = db.prepare('SELECT * FROM ai_chats WHERE id = ? AND user_id = ?').get(id, session.user.id) as { title: string } | undefined;
  
  if (!chat) return notFound();
  
  const messages = db.prepare('SELECT id, chat_id, role, content FROM ai_messages WHERE chat_id = ? ORDER BY created_at ASC').all(id) as any[];

  return (
    <ChatInterface 
      chatId={id} 
      initialMessages={messages} 
      initialTitle={chat.title} 
    />
  );
}
