'use client';
import Link from 'next/link';
import { Home, Film, TrendingUp, Award, Users, Wand2, Sparkles, User } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSession } from "next-auth/react";

export default function FloatingNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Hide on AI pages and login
  if (pathname === '/ai' || pathname.startsWith('/ai/') || pathname === '/login') return null;

  // Use the same bottom floating nav for all pages including AI
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-3 bg-[#0a0a0a]/80 backdrop-blur-2xl border border-white/10 p-2.5 rounded-full shadow-2xl w-fit transition-all duration-500 ease-out hover:border-white/20 hover:bg-[#0a0a0a]/90 ring-1 ring-white/10"
      >
        <Link
          href="/"
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
          <Wand2 size={20} />
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
          <Sparkles size={20} />
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

