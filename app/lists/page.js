'use client';
import { useState, useEffect } from 'react';
import { getLists } from '@/lib/api';
import { motion } from 'framer-motion';
import { Plus, ListVideo, ArrowRight, CheckCircle, Clock, PlayCircle } from 'lucide-react';
import axios from 'axios';
import Link from 'next/link';

export default function Lists() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLists();
  }, []);

  const fetchLists = async () => {
    try {
      const data = await getLists();
      setLists(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createList = async () => {
    const name = prompt("Enter list name:");
    if (!name) return;
    await axios.post('/api/lists', { name });
    fetchLists();
  };

  const systemListNames = ['Watched', 'Watching', 'To Watch', 'Favorites'];
  const systemLists = lists.filter(l => systemListNames.includes(l.name));
  const customLists = lists.filter(l => !systemListNames.includes(l.name));

  const getListIcon = (name) => {
    switch(name) {
      case 'Watched': return <CheckCircle size={24} className="text-white" />;
      case 'Watching': return <PlayCircle size={24} className="text-white" />;
      case 'To Watch': return <Clock size={24} className="text-white" />;
      default: return <ListVideo size={24} className="text-white" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto pt-10 space-y-16">
      {/* System Lists */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white pl-1 border-l-4 border-white/20 leading-none">My Library</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {systemLists.map((list) => (
            <Link key={list.id} href={`/lists/${list.id}`}>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="h-40 relative overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm p-6 hover:border-white/30 transition-all cursor-pointer group"
              >
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  {getListIcon(list.name)}
                </div>
                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                    {getListIcon(list.name)}
                    </div>
                    <h3 className="text-xl font-bold text-white">{list.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400 group-hover:text-white transition-colors">
                    <span className="text-sm font-medium">View Collection</span>
                    <ArrowRight size={16} />
                  </div>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>

      {/* Custom Lists */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white pl-1 border-l-4 border-white/20 leading-none">Custom Lists</h2>
          <button 
            onClick={createList}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white px-4 py-2 rounded-lg font-medium transition-all"
          >
            <Plus size={18} /> New List
          </button>
        </div>

        {customLists.length === 0 ? (
          <div className="text-zinc-500 italic text-center py-12 border border-white/5 rounded-xl bg-black/20">
            No custom lists created yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {customLists.map((list) => (
              <Link key={list.id} href={`/lists/${list.id}`}>
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-black/40 backdrop-blur-sm border border-white/10 p-6 rounded-xl hover:border-white/20 transition-all cursor-pointer h-full flex flex-col justify-between min-h-[160px]"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                        <ListVideo size={20} className="text-white" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-1 line-clamp-1">{list.name}</h3>
                    <p className="text-zinc-500 text-xs">Created {new Date(list.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex justify-end mt-4">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                      <ArrowRight size={16} className="text-zinc-400 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
