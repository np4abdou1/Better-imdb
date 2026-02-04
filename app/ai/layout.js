import { auth } from '@/auth';
import db from '@/lib/db';
import ChatSidebar from '@/components/ai/ChatSidebar';

export default async function Layout({ children }) {
  const session = await auth();
  
  // Fetch chats
  let chats = [];
  try {
     if (session?.user?.id) {
       chats = db.prepare('SELECT * FROM ai_chats WHERE user_id = ? ORDER BY updated_at DESC').all(session.user.id);
     }
  } catch (e) {
     console.error('Failed to load chats in layout:', e);
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-aurora text-white font-sans">
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <ChatSidebar chats={chats} />
      {children}
    </div>
  );
}
