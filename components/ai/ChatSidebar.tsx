'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Sidebar as SidebarIcon, MoreVertical } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function ChatSidebar({ chats: initialChats }: { chats: any[] }) {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeChatId = params?.id;
  
  // Local chats state for optimistic updates
  const [chats, setChats] = useState<any[]>(initialChats);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | string[] | null>(activeChatId || null);

  const uniqueChats = useMemo(() => {
    const map = new Map();
    for (const chat of chats) {
      if (!chat?.id) continue;
      if (!map.has(chat.id)) map.set(chat.id, chat);
    }
    return Array.from(map.values());
  }, [chats]);

  // Sync with prop updates (server revalidation)
  React.useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  // Handle optimistic updates from ChatInterface
  useEffect(() => {
    const handleChatCreated = (e: any) => {
      const { id, title } = e.detail;
      setChats((prev) => {
        if (prev.some((chat) => chat.id === id)) return prev;
        return [{ id, title, updated_at: new Date().toISOString() }, ...prev];
      });
      setActiveId(id);
    };

    const handleTitleUpdated = (e: any) => {
      const { id, title } = e.detail;
      setChats(prev => prev.map(c => c.id === id ? { ...c, title } : c));
    };

    window.addEventListener('orb-chat-created', handleChatCreated as any);
    window.addEventListener('orb-title-updated', handleTitleUpdated as any);

    return () => {
      window.removeEventListener('orb-chat-created', handleChatCreated as any);
      window.removeEventListener('orb-title-updated', handleTitleUpdated as any);
    };
  }, []);

  // Keep active highlight in sync with URL
  useEffect(() => {
    if (!pathname) return;
    const match = pathname.match(/^\/ai\/c\/([^/]+)/);
    setActiveId(match ? match[1] : null);
  }, [pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle New Chat
  const handleNewChat = async () => {
    try {
      const res = await fetch('/api/ai/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' })
      });

      if (!res.ok) throw new Error('Failed to create chat');
      const data = await res.json();

      window.dispatchEvent(new CustomEvent('orb-chat-created', {
        detail: { id: data.id, title: data.title || 'New Chat' }
      }));

      setActiveId(data.id);
      router.push(`/ai/c/${data.id}`);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  // Delete Chat
  const handleDeleteChat = async (chatId: string) => {
    const previousChats = [...chats];
    setChats(prev => prev.filter(c => c.id !== chatId));
    setOpenDropdown(null);

    try {
      await fetch(`/api/ai/chats/${chatId}`, { method: 'DELETE' });
      router.refresh();
      if (activeId === chatId) {
        router.push('/ai');
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
      setChats(previousChats); // Revert
    }
  };



  if (!session?.user) return null;

  return (
    <>
      {/* Menu Toggle Button - Top Left (Fixed position relative to viewport) */}
      <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="fixed top-6 left-6 z-40 flex items-center gap-2 px-3 py-2 text-zinc-500 hover:text-zinc-200 transition-all rounded-full hover:bg-zinc-800/50 backdrop-blur-md border border-transparent hover:border-white/10 group"
          title={isSidebarOpen ? "Hide History" : "Show History"}
      >
          <div className="relative">
            <SidebarIcon size={18} className="group-hover:text-white transition-colors" />
            {!isSidebarOpen && activeId && <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-pulse" />}
          </div>
          <span className="text-xs font-medium uppercase tracking-wider group-hover:text-white transition-colors">History</span>
      </button>

      {/* Floating Sidebar - Desktop/Tablet */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.div
              initial={{ opacity: 0, x: -300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -300 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="fixed top-4 left-4 w-72 max-h-[calc(100vh-2rem)] flex-shrink-0 flex flex-col z-50 hidden md:flex bg-[#0a0a0a]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden"
          >
              {/* Header with Close Button */}
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Close History"
                >
                  <SidebarIcon size={16} />
                </button>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 font-mono">History</span>
              </div>

              {/* New Chat Button */}
              <div className="px-4 pb-2">
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5 hover:border-white/20 rounded-lg transition-all text-sm font-medium shadow-sm group"
                >
                  <Plus size={16} className="text-zinc-500 group-hover:text-white transition-colors" />
                  New Chat
                </button>
              </div>

              <div className="overflow-y-auto px-4 py-2 pb-4 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700">
                {uniqueChats.length === 0 && (
                  <div className="px-3 py-4 text-center text-zinc-500 text-sm font-mono">No previous logs</div>
                )}
                <AnimatePresence initial={false}>
                {uniqueChats.map(chat => (
                    <motion.div
                      key={chat.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="relative"
                    >
                      <Link
                          href={`/ai/c/${chat.id}`}
                          className={clsx(
                              "w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-150 font-sans flex items-center justify-between group cursor-pointer block text-sm border",
                              activeId === chat.id
                                ? "bg-white/10 text-white border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border-transparent hover:border-white/5"
                          )}
                          title={chat.title || 'New Chat'}
                      >
                          <span className="truncate flex-1">{chat.title || 'New Chat'}</span>
                          <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenDropdown(openDropdown === chat.id ? null : chat.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 ml-2 p-1 hover:bg-white/10 rounded transition-all flex-shrink-0"
                              title="Options"
                          >
                              <MoreVertical size={14} className="text-zinc-400 hover:text-white" />
                          </button>
                      </Link>
                      <AnimatePresence>
                        {openDropdown === chat.id && (
                          <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.1 }}
                            className="absolute right-0 top-full mt-1 w-32 border border-zinc-800 rounded-lg overflow-hidden shadow-2xl z-[60]"
                            style={{ backgroundColor: 'var(--background)' }}
                          >
                            <button
                              onClick={() => handleDeleteChat(chat.id)}
                              className="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2 text-xs font-medium"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                  </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
       <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0, x: -300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -300 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="md:hidden fixed top-4 left-4 w-72 max-h-[calc(100vh-2rem)] z-50 bg-[#0a0a0a]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden"
            >
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 font-mono">History</span>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 rounded-lg transition-colors"
                  title="Close"
                >
                   <SidebarIcon size={16} />
                </button>
              </div>

               <div className="px-4 pb-2">
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 hover:text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <Plus size={16} />
                  New Chat
                </button>
              </div>

               <div className="overflow-y-auto px-4 py-2 pb-4 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700">
                {uniqueChats.length === 0 && (
                  <div className="px-3 py-4 text-center text-zinc-500 font-mono" style={{ fontSize: '14.28px' }}>No previous logs</div>
                )}
                <AnimatePresence initial={false}>
                {uniqueChats.map(chat => (
                    <motion.div
                      key={chat.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="relative"
                    >
                      <Link
                          href={`/ai/c/${chat.id}`}
                          onClick={() => setIsSidebarOpen(false)}
                          className={clsx(
                              "w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-150 font-sans flex items-center justify-between group cursor-pointer block",
                              activeId === chat.id
                                ? "bg-white/10 text-white border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                                : "text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-300"
                          )}
                          title={chat.title || 'New Chat'}
                          style={{ fontSize: '14.28px' }}
                      >
                          <span className="truncate flex-1">{chat.title || 'New Chat'}</span>
                          <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenDropdown(openDropdown === chat.id ? null : chat.id);
                              }}
                              className="opacity-0 group-hover:opacity-70 ml-2 p-1.5 hover:opacity-100 hover:bg-zinc-700/50 rounded transition-all flex-shrink-0"
                              title="Options"
                          >
                              <MoreVertical size={14} className="text-zinc-400" />
                          </button>
                      </Link>
                      <AnimatePresence>
                        {openDropdown === chat.id && (
                          <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.1 }}
                            className="absolute right-2 top-full mt-1 w-32 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-xl z-[60]"
                          >
                            <button
                              onClick={() => handleDeleteChat(chat.id)}
                              className="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                              style={{ fontSize: '14.28px' }}
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                  </AnimatePresence>
               </div>
            </motion.div>
          )}
       </AnimatePresence>

       {/* Mobile Overlay */}
       <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden fixed inset-0 z-40 bg-black/20"
            />
          )}
       </AnimatePresence>
    </>
  );
}
