import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Globe, 
  Database, 
  Cpu, 
  Search, 
  ListPlus, 
  Film, 
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock
} from 'lucide-react';
import clsx from 'clsx';

function getFavicon(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  } catch {
    return null;
  }
}

function getHost(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return url;
    }
}

export default function AgentSummary({ status, sessionActivity, toolProgress }) {
  // Toggle state (default closed)
  const [isOpen, setIsOpen] = useState(false);

  // Auto-open on mobile when active (optional, maybe distracting)
  // useEffect(() => {
  //   if (status !== 'idle' && window.innerWidth < 768) setIsOpen(true);
  // }, [status]);

  const { searches = [], toolCalls = [], listEdits = [] } = sessionActivity || {};

  return (
    <>
      {/* Status Toggle Button - Fixed position relative to viewport */}
      <button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed top-6 right-6 z-40 flex items-center gap-2 px-3 py-2 text-zinc-500 hover:text-zinc-200 transition-all rounded-full hover:bg-zinc-800/50 backdrop-blur-md border border-transparent hover:border-white/10 group"
          title={isOpen ? "Hide Status" : "Show Status"}
      >
          <span className="text-xs font-medium uppercase tracking-wider group-hover:text-white transition-colors">Status</span>
          <div className="relative">
             <Activity size={18} className={clsx("transition-colors", status === 'active' || status === 'thinking' ? "text-white animate-pulse" : "text-zinc-500 group-hover:text-white")} />
             {!isOpen && status !== 'idle' && <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-pulse" />}
          </div>
      </button>

      {/* Sidebar Panel */}
      <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div 
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-4 right-4 w-72 max-h-[calc(100vh-2rem)] flex flex-col z-50 bg-[#0a0a0a]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">System Activity</span>
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/5">
                    <div className={clsx("w-1.5 h-1.5 rounded-full", status === 'idle' ? "bg-zinc-500" : "bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]")} />
                    <span className="text-[10px] font-medium text-zinc-300 leading-none">
                        {status === 'thinking' ? 'THINK' : 
                        status === 'active' ? 'BUSY' : 
                        status === 'idle' ? 'IDLE' : 'WAIT'}
                    </span>
                </div>
                <button 
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                    <Activity size={16} />
                </button>
            </div>
            </div>

            {/* Content Scroll Area */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent p-4 pl-5 pr-5 space-y-7">

                
                {/* Active Tool Progress */}
                <AnimatePresence>
                    {toolProgress && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-white/5 border border-white/10 rounded-lg p-3"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                    <Activity size={12} className="animate-spin text-zinc-400" />
                                    {toolProgress.tool.replace(/_/g, ' ')}
                                </span>
                                <span className="text-xs font-mono text-zinc-400">
                                    {toolProgress.total ? Math.round((toolProgress.completed / toolProgress.total) * 100) : 0}%
                                </span>
                            </div>
                            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${toolProgress.total ? (toolProgress.completed / toolProgress.total) * 100 : 0}%` }}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Web Searches Section */}
                {searches.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                            <Globe size={12} />
                            Sources Used ({searches.length})
                        </div>
                        <div className="space-y-2 max-h-[160px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent pr-1">
                            {[...searches].reverse().map((s, i) => ( 
                                <motion.a 
                                    href={s.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    key={i}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all group"
                                >
                                    <img 
                                        src={getFavicon(s.url)} 
                                        className="w-4 h-4 rounded-sm"
                                        alt=""
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-zinc-300 truncate group-hover:text-white transition-colors">
                                            {s.title || getHost(s.url)}
                                        </div>
                                        <div className="text-[10px] text-zinc-600 truncate font-mono">
                                            {getHost(s.url)}
                                        </div>
                                    </div>
                                    <ExternalLink size={12} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </motion.a>
                            ))}
                        </div>
                    </div>
                )}

                {/* System Activity Log */}
                <div className="space-y-3">
                     <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                            <ListPlus size={12} />
                            System Activity
                     </div>
                     <div className="space-y-0 relative border-l border-white/10 ml-1.5 pl-4 py-1">
                        {toolCalls.length === 0 && listEdits.length === 0 && (
                             <div className="text-xs text-zinc-600 italic">No system actions yet</div>
                        )}
                        
                        {[...toolCalls, ...listEdits]
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .slice(0, 8) // Show last 8 actions
                            .map((action, i) => (
                            <div key={i} className="mb-4 last:mb-0 relative group">
                                <div className={clsx(
                                    "absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 bg-[#0a0a0a] transition-colors",
                                    action.status === 'running' ? "border-white animate-pulse bg-white" : "border-zinc-700 group-hover:border-zinc-500"
                                )} />
                                
                                <div className="flex items-start justify-between bg-zinc-900/40 p-2.5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="pr-2">
                                        <div className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                                            {action.tool ? action.tool.replace(/_/g, ' ') : `Edited List`}
                                        </div>
                                        <div className="text-xs text-zinc-400 mt-0.5">
                                            {action.count ? `Added ${action.count} items` : 
                                             action.tool === 'search_imdb' ? 'External API Request' :
                                             action.tool === 'get_title_details' ? 'Metadata Fetch' :
                                             'System Operation'}
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-mono text-zinc-500 mt-0.5">
                                        {new Date(action.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                                    </span>
                                </div>
                            </div>
                        ))}
                     </div>
                </div>

                {/* Footer Info */}
                <div className="pt-4 border-t border-white/5 text-[10px] text-zinc-600 font-mono text-center">
                    ORB AI • v0.1.0
                </div>
            </div>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
