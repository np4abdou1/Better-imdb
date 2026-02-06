'use client';
import { useState, useEffect, use } from 'react';
import axios from 'axios';
import { getBatchTitleDetails } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import MediaCard from '@/components/MediaCard';

export default function ListDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchListDetails();
  }, [id]);

  const fetchListDetails = async () => {
    try {
      // Fetch list info and items in parallel
      const [listsRes, itemsRes] = await Promise.all([
        axios.get('/api/lists'),
        axios.get(`/api/lists/${id}/items`)
      ]);

      const currentList = listsRes.data.find(l => l.id === parseInt(id));
      setList(currentList);

      // Use batch fetching for better performance (fixes N+1 problem)
      const titleIds = itemsRes.data.map(item => item.title_id);
      if (titleIds.length > 0) {
        const titles = await getBatchTitleDetails(titleIds);
        setItems(titles);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading list...</div>;
  if (!list) return <div className="min-h-screen flex items-center justify-center text-red-500">List not found</div>;

  return (
    <div className="pt-10 max-w-7xl mx-auto space-y-8">
      <Link href="/lists" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group">
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span>Back to Lists</span>
      </Link>

      <div className="border-b border-white/10 pb-6">
        <h1 className="text-4xl font-bold text-white mb-2">{list.name}</h1>
        <p className="text-zinc-500">{items.length} {items.length === 1 ? 'title' : 'titles'}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-24">
        {items.map((title, i) => (
          <motion.div
            key={title.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
          >
            <MediaCard title={title} priority={i < 5} />
          </motion.div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="text-center py-20 border border-white/5 rounded-xl bg-black/20">
          <p className="text-zinc-500 mb-2">This list is empty.</p>
          <p className="text-zinc-600 text-sm">Go add some titles!</p>
        </div>
      )}
    </div>
  );
}
