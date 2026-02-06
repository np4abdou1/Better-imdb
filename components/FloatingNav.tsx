'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, TrendingUp, Award, Sparkles, Wand2, Users, User, Check } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { useSession } from "next-auth/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface NavItem {
  name: string;
  link: string;
  icon: React.ReactNode;
}

interface FloatingNavProps {
  navItems?: NavItem[];
  className?: string;
}

export default function FloatingNav({ navItems, className }: FloatingNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [notification, setNotification] = useState<string | null>(null);

  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(true);

  useMotionValueEvent(scrollY, "change", (current) => {
    if (typeof current === "number") {
      const direction = current - (scrollY.getPrevious() || 0);

      if (scrollY.get() < 0.05) {
        setVisible(true);
      } else {
        if (direction < 0) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    }
  });

  useEffect(() => {
    const handleNotification = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      const { message } = customEvent.detail;
      setNotification(message);
      setTimeout(() => setNotification(null), 3000);
    };

    window.addEventListener('show-notification', handleNotification);
    return () => window.removeEventListener('show-notification', handleNotification);
  }, []);

  // Hide on AI pages, login, and watch
  if (pathname === '/ai' || pathname.startsWith('/ai/') || pathname === '/login' || pathname.startsWith('/watch/')) return null;

  return (
    <AnimatePresence mode="wait">
        <motion.div
        initial={{
            opacity: 1,
            y: -100,
        }}
        animate={{
            y: visible ? 0 : 100,
            opacity: visible ? 1 : 0,
        }}
        transition={{
            duration: 0.2,
        }}
        className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4",
            className
        )}
        >
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

        <div className="flex items-center gap-3 bg-[#0a0a0a]/80 backdrop-blur-2xl border border-white/10 p-2.5 rounded-full shadow-2xl w-fit transition-all duration-500 ease-out hover:border-white/20 hover:bg-[#0a0a0a]/90 ring-1 ring-white/10">
            {navItems ? (
                navItems.map((item, idx) => (
                    <Link
                        key={`link-${idx}`}
                        href={item.link}
                        className={cn(
                        "relative dark:text-neutral-50 items-center flex space-x-1 text-neutral-600 dark:hover:text-neutral-300 hover:text-neutral-500"
                        )}
                        title={item.name}
                    >
                        {item.icon}
                    </Link>
                ))
            ) : (
                <>
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
                </>
            )}
        </div>
        </motion.div>
    </AnimatePresence>
  );
}
