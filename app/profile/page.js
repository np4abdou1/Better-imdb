'use client';
import { useState, useEffect } from 'react';
import { getLists } from '@/lib/api';
import { motion } from 'framer-motion';
import { Plus, List, DoorOpen, UserCircle } from '@phosphor-icons/react';
import axios from 'axios';
import Link from 'next/link';
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Profile() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchLists();
    }
  }, [status, router]);

  const fetchLists = async () => {
    try {
      const data = await getLists();
      if (Array.isArray(data)) {
        setLists(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createList = async () => {
    const name = prompt("Enter list name:");
    if (!name) return;
    try {
      await axios.post('/api/lists', { name });
      fetchLists();
    } catch (error) {
       alert("Failed to create list. It might already exist.");
    }
  };
  
  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  if (status === 'loading' || (status === 'authenticated' && loading)) {
     return <div className="min-h-screen flex items-center justify-center text-white">Loading...</div>;
  }
  
  if (!session) return null;

  return (
    <div className="min-h-screen pt-24 pb-32">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-16 pb-8 border-b border-white/5">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-900">
              {session.user?.image ? (
                <img src={session.user.image} alt={session.user?.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <UserCircle size={36} weight="duotone" className="text-zinc-600" />
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white mb-1">{session.user?.name}</h1>
              <p className="text-zinc-500 text-sm">{session.user?.email}</p>
            </div>
          </div>
          
          <button 
            onClick={handleSignOut}
            className="text-zinc-400 hover:text-white text-sm transition-colors flex items-center gap-2"
          >
            <DoorOpen size={16} weight="bold" />
            Sign out
          </button>
        </div>

        {/* Lists Section */}
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Lists</h2>
            <button 
              onClick={createList}
              className="flex items-center gap-2 text-sm bg-white text-black hover:bg-zinc-200 px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              <Plus size={18} weight="bold" />
              New List
            </button>
          </div>

          {lists.length === 0 ? (
            <div className="text-center py-24 text-zinc-500 text-sm">
              No lists yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {lists.map((list, index) => (
                <Link key={list.id} href={`/lists/${list.id}`}>
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="group border border-white/5 hover:border-white/10 bg-zinc-900/30 hover:bg-zinc-900/50 rounded-lg p-5 transition-all cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-black/50 flex items-center justify-center">
                        <List size={20} weight="duotone" className="text-zinc-400 group-hover:text-white transition-colors" />
                      </div>
                      <div>
                        <h3 className="text-white font-medium text-base mb-0.5">{list.name}</h3>
                        <p className="text-zinc-600 text-xs">
                          Created {new Date(list.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-zinc-600 group-hover:text-zinc-400 transition-colors">
                      →
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
