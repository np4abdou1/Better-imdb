import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import ChatSidebar from '@/components/ai/ChatSidebar';
import { WithId, Document } from 'mongodb';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  
  // Fetch chats
  let chats: any[] = [];
  try {
     if (session?.user?.id) {
       const db = await getDb();
       const rawChats = await db.collection('ai_chats')
        .find({ user_id: session.user.id })
        .sort({ updated_at: -1 })
        .toArray();
       
       chats = rawChats.map((c: WithId<Document>) => ({
         ...c,
         _id: c._id.toString(), // Ensure _id is a string for serialization
         id: c._id.toString(), // Map _id to id for frontend
       }));
     }
  } catch (e) {
     console.error('Failed to load chats in layout:', e);
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[#151515] text-white font-sans">
      <ChatSidebar chats={chats} />
      {children}
    </div>
  );
}
