'use client';
import Link from 'next/link';
import { Home, Search, Film, ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function FloatingNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/') return null; // Don't show on home screen if we want a clean look, or maybe just show Home button? 
  // User asked to "remove header add floating buttons". 
  // Usually floating buttons are bottom right or bottom center.

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-2 bg-black/80 backdrop-blur-xl border border-white/10 p-2 rounded-full shadow-2xl"
      >
        <button 
          onClick={() => router.back()}
          className="p-3 bg-zinc-800/50 hover:bg-zinc-700 rounded-full text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <Link 
          href="/" 
          className="p-3 hover:bg-zinc-700 rounded-full text-white transition-colors"
        >
          <Home size={20} />
        </Link>
        
        <Link 
          href="/lists" 
          className="p-3 hover:bg-zinc-700 rounded-full text-white transition-colors"
        >
          <Film size={20} />
        </Link>
      </motion.div>
    </div>
  );
}
