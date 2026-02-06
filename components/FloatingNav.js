'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, Film, TrendingUp, Award, Users, Sparkles, Wand2, User, Check } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from "next-auth/react";

export default function FloatingNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const handleNotification = (e) => {
      const { message } = e.detail;
      setNotification(message);
      setTimeout(() => setNotification(null), 3000);
    };

    window.addEventListener('show-notification', handleNotification);
    return () => window.removeEventListener('show-notification', handleNotification);
  }, []);

  // Hide on AI pages, login, and watch
  if (pathname === '/ai' || pathname.startsWith('/ai/') || pathname === '/login' || pathname.startsWith('/watch/')) return null;

  // Use the same bottom floating nav for all pages including AI
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            className="absolute bottom-full right-0 mb-4 min-w-[200px] flex justify-end"
          >
            <div className="bg-[#0a0a0a] border border-white/20 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3">
              <div className="bg-white/10 p-1.5 rounded-full">
                <Check size={14} className="text-white" strokeWidth={3} />
              </div>
              <span className="text-sm font-medium">{notification}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-3 bg-[#0a0a0a]/80 backdrop-blur-2xl border border-white/10 p-2.5 rounded-full shadow-2xl w-fit transition-all duration-500 ease-out hover:border-white/20 hover:bg-[#0a0a0a]/90 ring-1 ring-white/10"
      >
        <Link
          href="/"
          onClick={(e) => {
            if (pathname === '/') {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent('reset-search'));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          className={`p-2 rounded-full transition-colors ${pathname === '/' ? 'bg-white text-black' : 'hover:bg-zinc-700 text-white'}`}
          title="Home"
        >
          <Home size={20} />
        </Link>
        
        {/* ... (Middle links unchanged, I'll preserve them in the full replacement if I overwrite, 
               but sticking to replacing /lists link is safer if I can context match.
               Except I need to inject user icon.) */}
        
        <Link
          href="/trending"
          className={`p-2 rounded-full transition-colors ${pathname === '/trending' ? 'bg-white text-black' : 'hover:bg-zinc-700 text-white'}`}
          title="Trending"
        >
          <TrendingUp size={20} />
        </Link>

        <Link
          href="/top"
          className={`p-2 rounded-full transition-colors ${pathname === '/top' ? 'bg-white text-black' : 'hover:bg-zinc-700 text-white'}`}
          title="Top Rated"
        >
          <Award size={20} />
        </Link>

        <Link
          href="/anime"
          className={`p-2 rounded-full transition-colors ${pathname === '/anime' ? 'bg-white text-black' : 'hover:bg-zinc-700 text-white'}`}
          title="Top Anime"
        >
          <Sparkles size={20} />
        </Link>

        <Link
          href="/people"
          className={`p-2 rounded-full transition-colors ${pathname === '/people' ? 'bg-white text-black' : 'hover:bg-zinc-700 text-white'}`}
          title="People"
        >
          <Users size={20} />
        </Link>

        <Link
          href="/ai?expand=true"
          className={`p-2 rounded-full transition-colors ${
            pathname === '/ai'
              ? 'bg-white text-black'
              : 'hover:bg-zinc-700 text-white'
          }`}
          title="AI Assistant"
        >
          <Wand2 size={20} />
        </Link>

        <Link
          href="/profile"
          className={`rounded-full transition-colors flex items-center justify-center ${
            session?.user?.image
              ? `p-[3px] overflow-hidden border ${pathname === '/profile' ? 'border-white' : 'border-zinc-700'}`
              : `p-2 ${pathname === '/profile' ? 'bg-white text-black' : 'hover:bg-zinc-700 text-white'}`
          }`}
          title="Profile"
        >
          {session?.user?.image ? (
              <img
                src={session.user.image}
                alt="Profile"
                className="w-[32px] h-[32px] rounded-full object-cover"
              />
          ) : (
              <User size={20} />
          )}
        </Link>
      </motion.div>
    </div>
  );
}

