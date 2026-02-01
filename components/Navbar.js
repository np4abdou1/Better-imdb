'use client';
import Link from 'next/link';
import { Search, Film } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import clsx from 'clsx';

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="group relative">
          <motion.span 
            className="text-2xl font-black tracking-tighter text-white inline-block"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            watcharr
            <motion.span 
              className="absolute -bottom-1 left-0 h-1 bg-[#f5c518] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ delay: 0.5, duration: 0.5 }}
            />
          </motion.span>
        </Link>
        
        <div className="flex gap-6 text-sm font-medium text-zinc-400">
          <Link 
            href="/" 
            className={clsx("flex items-center gap-2 hover:text-white transition-colors relative", pathname === '/' && "text-white")}
          >
            <Search size={18} />
            Search
            {pathname === '/' && (
              <motion.div layoutId="underline" className="absolute -bottom-5 left-0 right-0 h-0.5 bg-white" />
            )}
          </Link>
          <Link 
            href="/lists" 
            className={clsx("flex items-center gap-2 hover:text-white transition-colors relative", pathname === '/lists' && "text-white")}
          >
            <Film size={18} />
            Lists
            {pathname === '/lists' && (
              <motion.div layoutId="underline" className="absolute -bottom-5 left-0 right-0 h-0.5 bg-white" />
            )}
          </Link>
        </div>
      </div>
    </nav>
  );
}