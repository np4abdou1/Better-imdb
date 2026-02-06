'use client';

import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PaperPlaneRight,
  CaretDown,
  Spinner,
  Check,
  ArrowDown
} from '@phosphor-icons/react';
import { Home, TrendingUp, Award, Users, Wand2, Sparkles, User, Share2, RotateCcw, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import InlineMediaCard from '@/components/ai/InlineMediaCard';
import InlineStreamCard from '@/components/ai/InlineStreamCard';
import StreamPlayer from '@/components/StreamPlayer';
import AgentSummary from '@/components/ai/AgentSummary';
import AuthPrompt from '@/components/ai/AuthPrompt';
import clsx from 'clsx';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

function normalizeTitle(title) {
  if (!title) return null;
  const imageUrl = title.primaryImage?.url || title.poster || title.image;
  const primaryImage = imageUrl ? { url: imageUrl } : null;

  const ratingValue = typeof title.rating === 'number'
    ? title.rating
    : title.rating?.aggregateRating || title.averageRating || null;

  return {
    id: title.id || title.imdb_id || title.title_id,
    primaryTitle: title.primaryTitle || title.title || title.name,
    startYear: title.startYear || title.year || title.releaseYear,
    type: title.type || title.titleType,
    rating: ratingValue ? { aggregateRating: ratingValue } : null,
    primaryImage,
    reason: title.reason || null
  };
}

function getFaviconUrl(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch (error) {
    return null;
  }
}

function parseMediaSegments(content) {
  if (!content) return [];

  const segments = [];
  const regex = /```media_grid\s*([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push({ type: 'text', content: before });
    }

    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        segments.push({ type: 'media', items: parsed });
      } else {
        segments.push({ type: 'text', content: match[0] });
      }
    } catch (e) {
      console.error('[parseMediaGrid] Failed to parse:', e.message);
      segments.push({ type: 'text', content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  const after = content.slice(lastIndex);
  if (after.trim()) {
    segments.push({ type: 'text', content: after });
  }

  return segments;
}

const processTextContent = (text) => {
    if (typeof text !== 'string') return text;
    
    // Regex for:
    // ==highlight==
    // ++underline++
    // !!golden!!
    const regex = /(==.*?==|\+\+.*?\+\+|!!.*?!!)/g;
    
    const parts = text.split(regex);
    
    return parts.map((part, index) => {
        if (part.startsWith('==') && part.endsWith('==')) {
            return <mark key={index} className="bg-yellow-500/20 text-yellow-200 px-1 rounded mx-0.5">{part.slice(2, -2)}</mark>;
        }
        if (part.startsWith('++') && part.endsWith('++')) {
            return <u key={index} className="decoration-zinc-400 decoration-2 underline-offset-4">{part.slice(2, -2)}</u>;
        }
        if (part.startsWith('!!') && part.endsWith('!!')) {
            // Low golden yellow for important text
            return <span key={index} className="text-[#ffd700] font-medium tracking-wide">{part.slice(2, -2)}</span>;
        }
        return part;
    });
};

const RichText = ({ children }) => {
    return React.Children.map(children, child => {
        if (typeof child === 'string') return processTextContent(child);
        return child; 
    });
};

const MarkdownComponents = {
  p: ({ children }) => <p className="mb-5 last:mb-0 leading-8 text-white text-base" style={{ fontSize: '17.6px', lineHeight: '1.8' }}><RichText>{children}</RichText></p>,
  strong: ({ children }) => <strong className="font-bold text-white tracking-wide"><RichText>{children}</RichText></strong>,
  em: ({ children }) => <em className="italic text-zinc-300"><RichText>{children}</RichText></em>,
  h1: ({ children }) => <h1 className="text-3xl font-bold mb-5 mt-9 first:mt-0 text-white tracking-tight" style={{ fontSize: '33px' }}><RichText>{children}</RichText></h1>,
  h2: ({ children }) => <h2 className="text-2xl font-bold mb-4 mt-7 first:mt-0 text-white tracking-tight border-b border-zinc-800 pb-3" style={{ fontSize: '24px' }}><RichText>{children}</RichText></h2>,
  h3: ({ children }) => <h3 className="text-xl font-bold mb-3 mt-5 first:mt-0 text-white" style={{ fontSize: '19.8px' }}><RichText>{children}</RichText></h3>,
  ul: ({ children }) => <ul className="list-disc ml-6 mb-5 space-y-2 text-white marker:text-zinc-500">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ml-6 mb-5 space-y-2 text-white marker:text-zinc-500">{children}</ol>,
  li: ({ children }) => <li className="leading-8 pl-1 text-base" style={{ fontSize: '17.6px' }}><RichText>{children}</RichText></li>,
  a: ({ href, children }) => (
    <a href={href} className="text-white hover:text-zinc-300 underline underline-offset-4 decoration-zinc-600 transition-colors" target="_blank" rel="noreferrer"><RichText>{children}</RichText></a>
  ),
  code: ({ inline, className, children, ...props }) => {
    if (inline) {
      return <code className="bg-white/10 px-2 py-1 rounded text-sm text-white font-mono border border-white/10" style={{ fontSize: '15.4px' }}><RichText>{children}</RichText></code>;
    }
    return (
      <pre className="bg-zinc-900/50 border border-zinc-700 rounded-lg p-5 overflow-x-auto my-5 shadow-sm">
        <code className={clsx(className, 'text-sm text-zinc-300 font-mono leading-7 whitespace-pre-wrap break-words')} style={{ fontSize: '15.4px', lineHeight: '1.75' }}>{children}</code>
      </pre>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-amber-500/50 bg-amber-500/5 pl-5 py-3 pr-2 italic text-zinc-300 my-6 rounded-r-lg">
      <RichText>{children}</RichText>
    </blockquote>
  ),
  hr: () => <hr className="border-zinc-800 my-7" />,
  table: ({ children }) => <div className="overflow-x-auto mb-5"><table className="border-collapse w-full">{children}</table></div>,
  th: ({ children }) => <th className="border border-zinc-700 bg-zinc-800/50 p-3 text-left font-semibold text-white"><RichText>{children}</RichText></th>,
  td: ({ children }) => <td className="border border-zinc-700 p-3 text-white"><RichText>{children}</RichText></td>,
};
    // Enhanced Markdown with rich text support
  const EnhancedMarkdownComponents = {
    ...MarkdownComponents,
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt || ''}
        className="rounded-xl border border-white/10 my-4 object-cover w-[240px] max-w-full shadow-lg"
        loading="lazy"
      />
    )
  };


const ThinkingMarkdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-7 text-zinc-500 text-sm">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-400">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-500">{children}</em>,
  h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4 text-zinc-400">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 text-zinc-400">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 text-zinc-400">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-1 text-zinc-500 marker:text-zinc-600">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-1 text-zinc-500 marker:text-zinc-600">{children}</ol>,
  li: ({ children }) => <li className="leading-6 pl-1 text-sm">{children}</li>,
  a: ({ href, children }) => <a href={href} className="text-zinc-400 hover:text-zinc-300 underline underline-offset-2" target="_blank" rel="noreferrer">{children}</a>,
  code: ({ inline, className, children }) => {
    if (inline) return <code className="bg-zinc-800/50 px-1.5 py-0.5 rounded text-xs text-zinc-400 font-mono">{children}</code>;
    return <pre className="bg-zinc-900/50 border border-zinc-800 rounded p-3 overflow-x-auto my-2"><code className="text-xs text-zinc-400 font-mono">{children}</code></pre>;
  },
  blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-700 pl-3 italic text-zinc-500 my-2">{children}</blockquote>,
};

const ThinkingMarkdown = memo(({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={ThinkingMarkdownComponents}
  >
    {content}
  </ReactMarkdown>
), (prev, next) => prev.content === next.content);

const ThinkingExpandable = ({ content, isFinished }) => {
  const [isExpanded, setIsExpanded] = useState(!isFinished);
  
  useEffect(() => {
    if (isFinished) {
      setIsExpanded(false);
    } else {
       setIsExpanded(true);
    }
  }, [isFinished]);

  if (!content) return null;

  return (
    <div className="mb-4 group">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors select-none opacity-70 group-hover:opacity-100"
      >
        <span className={clsx("transition-transform duration-200", isExpanded ? "rotate-180" : "")}>
          <CaretDown size={14} />
        </span>
        <span>Thinking Process</span>
      </button>
      
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-[22px] pt-2 pb-1 relative">
               <div className="absolute left-[6px] top-2 bottom-2 w-0.5 bg-zinc-800" />
               <ThinkingMarkdown content={content} />
               {!isFinished && <span className="inline-block w-1.5 h-3 ml-1 bg-zinc-500 animate-pulse align-middle rounded-sm" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MessageMarkdown = memo(({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={EnhancedMarkdownComponents}
  >
    {content}
  </ReactMarkdown>
), (prev, next) => prev.content === next.content);

const DEFAULT_MESSAGES = [];

export default function ChatInterface({ initialMessages = DEFAULT_MESSAGES, chatId: propChatId }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [chips, setChips] = useState([]);
  const [chipsLoading, setChipsLoading] = useState(true);
  const [toolProgress, setToolProgress] = useState(null);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [expandSources, setExpandSources] = useState(false);
  const [hasToken, setHasToken] = useState(null);
  const [activeStream, setActiveStream] = useState(null);
  const [sessionActivity, setSessionActivity] = useState({
    searches: [],
    toolCalls: [],
    listEdits: []
  });

  // Check if GITHUB_TOKEN exists
  useEffect(() => {
    async function checkToken() {
      try {
        const response = await fetch('/api/auth/check-token');
        if (response.ok) {
          const data = await response.json();
          setHasToken(data.available);
        } else {
          setHasToken(false);
        }
      } catch (error) {
        setHasToken(false);
      }
    }
    checkToken();
  }, []);

  // Ref to track current chat ID in streaming context
  const chatIdRef = useRef(propChatId);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const modelPickerRef = useRef(null);
  const chatContainerRef = useRef(null);

  const [isSearchExpanded, setIsSearchExpanded] = useState(Boolean(propChatId));
  const [allowOverflow, setAllowOverflow] = useState(false);
  const isFirstRenderRef = useRef(true);
  const chatKey = propChatId || 'new';

  // Expand search box on /ai page after mount to avoid hydration mismatch
  useEffect(() => {
    if (pathname === '/ai') {
      setIsSearchExpanded(true);
      // Auto-focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [pathname]);

  // Sync with prop changes - only on initial component mount for SSR hydration
  useEffect(() => {
    // Only sync on the very first render (SSR hydration)
    // Don't sync when propChatId changes during streaming - that causes message loss
    if (isFirstRenderRef.current) {
      setMessages(initialMessages);
      chatIdRef.current = propChatId;
      isFirstRenderRef.current = false;
    }
  }, []);

  // Load Models
  useEffect(() => {
    fetch('/api/ai/models')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => {
        const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
        setModels(list);
        if (list.length > 0) {
          const preferredModel = list.find(m => m.id === 'gpt-4.1') ||
            list.find(m => m.id.includes('gpt-4.1')) ||
            list.find(m => m.id.includes('gpt-4-turbo')) ||
            list.find(m => m.id.includes('gpt-4')) ||
            list[0];
          setSelectedModel(preferredModel.id);
        }
      })
      .catch(() => setSelectedModel('gpt-4.1'));
  }, []);

  // Load AI suggestion chips
  useEffect(() => {
    let isMounted = true;

    // Default fallback chips - set immediately for first render
    const defaultChips = [
      "Find trending movies",
      "Recommend sci-fi shows",
      "Top rated anime",
      "Oscar winners 2024"
    ];
    
    // Set default chips immediately to fix first-load rendering
    setChips(defaultChips);
    setChipsLoading(false);

    // Try to load from localStorage first
    const cachedChips = typeof window !== 'undefined'
      ? localStorage.getItem('ai_chips')
      : null;

    if (cachedChips) {
      try {
        const parsed = JSON.parse(cachedChips);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChips(parsed);
          setChipsLoading(false);
        }
      } catch (e) {
        console.error('Failed to parse cached chips:', e);
      }
    }

    // Fetch fresh chips from API
    fetch('/api/ai/chips')
      .then((res) => (res.ok ? res.json() : { chips: [] }))
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data?.chips) && data.chips.length > 0 ? data.chips : defaultChips;
        setChips(list);
        setChipsLoading(false);

        // Cache for future loads
        if (typeof window !== 'undefined' && list.length > 0) {
          localStorage.setItem('ai_chips', JSON.stringify(list));
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setChips(defaultChips);
        setChipsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle outside click for model picker
  useEffect(() => {
    function handleClickOutside(event) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(event.target)) {
        setShowModelPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initial expand check
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('expand') === 'true') {
        setIsSearchExpanded(true);
        setTimeout(() => inputRef.current?.focus(), 500);
      }
  }, []);

  // Scroll listener
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
      setShowScrollButton(!isNearBottom && messages.length > 0);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const stripMediaGrid = (content) => {
    if (!content) return '';
    let cleaned = content;

    // Filter out tool execution messages
    cleaned = cleaned.replace(/Calling\s+\w+\s+for:[^\n]*/gi, '');
    cleaned = cleaned.replace(/(\n|^)\s*\{\s*["'](?:queries|tool|args|function)["']\s*:[\s\S]*?\}(?=\n|$)/g, '');
    cleaned = cleaned.replace(/\{\s*["']queries["']\s*:\s*\[[\s\S]*?\]\s*\}/g, '');
    cleaned = cleaned.replace(/```json[\s\S]*?```/g, '');

    return cleaned.trim();
  };

  const extractThinking = (text) => {
    if (!text) return { thinking: null, content: '', isFinished: true };
    const thinkStart = text.indexOf('<think>');
    if (thinkStart === -1) return { thinking: null, content: text, isFinished: true };
    const thinkEnd = text.indexOf('</think>');
    if (thinkEnd === -1) {
      return { thinking: text.substring(thinkStart + 7), content: text.substring(0, thinkStart), isFinished: false };
    } else {
      return { thinking: text.substring(thinkStart + 7, thinkEnd), content: text.substring(0, thinkStart) + text.substring(thinkEnd + 8), isFinished: true };
    }
  };

  const processStreamingContent = (content) => {
    if (!content) return '';
    let cleaned = content;
    // Filter out tool execution messages
    cleaned = cleaned.replace(/Calling\s+\w+\s+for:[^\n]*/gi, '');
    cleaned = cleaned.replace(/(\n|^)\s*\{\s*["'](?:queries|tool|args|function)["']\s*:[\s\S]*?\}(?=\n|$)/g, '');
    cleaned = cleaned.replace(/\{\s*["']queries["']\s*:\s*\[[\s\S]*?\]\s*\}/g, '');
    cleaned = cleaned.replace(/(\n|^)\s*\{\s*["'](?:queries|tool|args|function)["']\s*:[\s\S]*?$/g, '');
    cleaned = cleaned.replace(/```json[\s\S]*$/g, '');

    // If a media_grid fence is started but not closed, hide it until complete
    const mediaFenceStart = cleaned.lastIndexOf('```media_grid');
    if (mediaFenceStart !== -1) {
      const afterFence = cleaned.slice(mediaFenceStart);
      const hasClosing = /```\s*$/.test(afterFence) || /```/.test(afterFence.replace('```media_grid', ''));
      if (!hasClosing) {
        cleaned = cleaned.slice(0, mediaFenceStart);
      }
    }

    const fenceCount = (cleaned.match(/^\s*```/gm) || []).length;
    if (fenceCount % 2 !== 0) cleaned += '\n```';
    return cleaned.trimStart();
  };

  const submitPrompt = async (text) => {
    const userText = (text || '').trim();
    if (!userText || isLoading) return;

    // If still checking token, wait a bit or just proceed
    // but better to have it resolved.
    const currentHasToken = hasToken;

    const userMsg = { role: 'user', content: userText, id: Date.now().toString() };

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setIsLoading(true);
    requestAnimationFrame(scrollToBottom);

    const aiMsgId = (Date.now() + 1).toString();
    setStreamingMessageId(aiMsgId);

    const aiMsg = {
      role: 'assistant',
      content: '',
      recommendations: [],
      sources: [],
      id: aiMsgId
    };

    setMessages((prev) => [...prev, aiMsg]);

    // INTERCEPT: If not authenticated, provide hardcoded response
    if (currentHasToken === false) {
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMsgId
              ? {
                  ...msg,
                  content: "To provide AI-powered recommendations and insights, I need you to authenticate with GitHub Copilot. This allows me to access the necessary models and tools.\n\nPlease click the **Authorize GitHub** button below to get started.",
                  isAuthPrompt: true // Mark this as an auth prompt for special rendering
                }
              : msg
          )
        );
        setIsLoading(false);
        setStreamingMessageId(null);
      }, 800);
      return;
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages.map(({ role, content }) => ({ role, content })),
          model: selectedModel || 'gpt-4.1',
          chatId: chatIdRef.current
        }),
      });

      if (!res.ok) throw new Error(`API Error (${res.status})`);
      if (!res.body) throw new Error('Streaming response not available');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamEnded = false;

      // Set timeout to forcefully end stream after 5 minutes
      const streamTimeout = setTimeout(() => {
        if (!streamEnded) {
          console.warn('Stream timeout: Force closing reader');
          reader.cancel();
          streamEnded = true;
        }
      }, 5 * 60 * 1000);

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          streamEnded = true;
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const jsonStr = part.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === 'chat_created') {
                chatIdRef.current = data.id;
                // Update URL without reloading/navigation
                window.history.replaceState(null, '', `/ai/c/${data.id}`);
                
                // Optimistically add to sidebar
                window.dispatchEvent(new CustomEvent('orb-chat-created', {
                  detail: { id: data.id, title: 'New Chat' }
                }));
            } else if (data.type === 'title_generated') {
                // Optimistically update title in sidebar
                window.dispatchEvent(new CustomEvent('orb-title-updated', {
                  detail: { id: chatIdRef.current, title: data.title }
                }));
            } else if (data.type === 'text') {
              let cleanedContent = data.content;
              if (/^\s*\{\s*["'](?:queries|tool|args|function)["']\s*:/i.test(cleanedContent)) continue;
              
              setMessages((prev) => prev.map((msg) =>
                msg.id === aiMsgId ? { ...msg, content: (msg.content || '') + cleanedContent } : msg
              ));
            } else if (data.type === 'stream_card') {
                setMessages((prev) => prev.map((msg) => {
                    if (msg.id !== aiMsgId) return msg;
                    return { ...msg, streamCard: data.data };
                }));
            } else if (data.type === 'media_grid') {
              const titles = (data.titles || []).map(normalizeTitle).filter(t => t?.id);
              setMessages((prev) => prev.map((msg) => {
                  if (msg.id !== aiMsgId) return msg;
                  const existingRecs = msg.recommendations || [];
                  const existingIds = new Set(existingRecs.map(r => r.id));
                  const newTitles = titles.filter(t => !existingIds.has(t.id));
                  return { ...msg, recommendations: [...existingRecs, ...newTitles].slice(0, 8) };
                })
              );
            } else if (data.type === 'web_search_sources') {
              const sources = Array.isArray(data.sources) ? data.sources : [];
              if (sources.length > 0) {
                // Update message sources
                setMessages((prev) => prev.map((msg) => {
                  if (msg.id !== aiMsgId) return msg;
                  const existing = msg.sources || [];
                  const existingUrls = new Set(existing.map((src) => src.url));
                  const nextSources = [...existing];
                  sources.forEach((src) => {
                    if (src?.url && !existingUrls.has(src.url)) {
                      nextSources.push({ title: src.title || '', url: src.url });
                      existingUrls.add(src.url);
                    }
                  });
                  return { ...msg, sources: nextSources.slice(0, 12) };
                }));

                // Update session activity
                setSessionActivity(prev => {
                   const newSearches = sources.filter(s => !prev.searches.some(existing => existing.url === s.url));
                   return { ...prev, searches: [...prev.searches, ...newSearches] };
                });
              }
            } else if (data.type === 'web_search_source') {
              // Handle individual source as it arrives (live streaming)
              const source = data.source;
              if (source?.url) {
                setMessages((prev) => prev.map((msg) => {
                  if (msg.id !== aiMsgId) return msg;
                  const existing = msg.sources || [];
                  const existingUrls = new Set(existing.map((src) => src.url));
                  
                  // Only add if not already present
                  if (!existingUrls.has(source.url)) {
                    return { ...msg, sources: [...existing, { title: source.title || '', url: source.url }].slice(0, 12) };
                  }
                  return msg;
                }));

                // Update session activity
                setSessionActivity(prev => ({
                   ...prev,
                   searches: [...prev.searches, source]
                }));
              }
            } else if (data.type === 'tool_start') {
              if (data.tool) {
                 setSessionActivity(prev => ({
                    ...prev, 
                    toolCalls: [...prev.toolCalls, { tool: data.tool, status: 'running', timestamp: Date.now() }]
                 }));
              }
              if (data.tool === 'bulk_add_to_list') {
                setToolProgress({
                  tool: data.tool,
                  completed: 0,
                  total: data.total || null,
                  status: 'running'
                });
              }
              if (data.tool === 'web_search') {
                setIsSearchingWeb(true);
              }
            } else if (data.type === 'tool_progress') {
              if (data.tool === 'bulk_add_to_list') {
                setToolProgress((prev) => ({
                  tool: data.tool || prev?.tool,
                  completed: typeof data.completed === 'number' ? data.completed : (prev?.completed || 0),
                  total: typeof data.total === 'number' ? data.total : (prev?.total || null),
                  status: 'running'
                }));
              }
            } else if (data.type === 'tool_end') {
              if (data.tool) {
                 setSessionActivity(prev => ({
                    ...prev,
                    toolCalls: prev.toolCalls.map(tc => tc.tool === data.tool && tc.status === 'running' ? { ...tc, status: 'done' } : tc)
                 }));
              }
              if (data.tool === 'bulk_add_to_list') {
                setToolProgress((prev) => prev ? ({ ...prev, status: 'done', completed: prev.total || prev.completed }) : null);
                setTimeout(() => setToolProgress(null), 1200);
                 
                // Log list edit activity
                setSessionActivity(prev => ({
                    ...prev,
                    listEdits: [...prev.listEdits, { type: 'bulk_add', count: data.completed || 0, timestamp: Date.now() }]
                }));
              }
              if (data.tool === 'add_to_list') {
                  // Log single list add
                  setSessionActivity(prev => ({
                      ...prev,
                      listEdits: [...prev.listEdits, { type: 'add', count: 1, timestamp: Date.now() }]
                  }));
              }
              if (data.tool === 'web_search') {
                setIsSearchingWeb(false);
              }
            } else if (data.type === 'recommendation') {
                const normalized = normalizeTitle(data.title);
                if (!normalized?.id) continue;
                setMessages((prev) => prev.map((msg) => {
                    if (msg.id !== aiMsgId) return msg;
                    const existingRecs = msg.recommendations || [];
                    if (existingRecs.find(r => r.id === normalized.id)) return msg;
                    return { ...msg, recommendations: [...existingRecs, normalized].slice(0, 8) };
                }));
            } else if (data.type === 'error') {
               const errorMsg = data.message || data.error || 'Unknown error';
               setMessages((prev) => prev.map((msg) =>
                  msg.id === aiMsgId ? { ...msg, content: (msg.content || '') + '\n\n*Error: ' + errorMsg + '*' } : msg
               ));
            }
          } catch (e) {
            console.error('JSON parse error', e);
          }
        }
      }

      // Clear stream timeout after successful completion
      clearTimeout(streamTimeout);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => prev.map((msg) =>
          msg.id === aiMsgId ? { ...msg, content: (msg.content || '') + '\n\n⚠️ **Error**: ' + err.message } : msg
      ));
    } finally {
      // Ensure loading state is reset
      console.log('[ChatInterface] Stream complete, resetting loading state');
      setIsLoading(false);
      setStreamingMessageId(null);
      setIsSearchingWeb(false);
      // Don't refresh router - it causes full re-render and loses streaming state
      // URL is already updated via replaceState, sidebar will get new chat on next navigation
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    submitPrompt(input);
  };

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/trending', label: 'Trending', icon: TrendingUp },
    { href: '/top', label: 'Top Rated', icon: Award },
    { href: '/anime', label: 'Top Anime', icon: Wand2 },
    { href: '/people', label: 'People', icon: Users },
    { href: '/ai?expand=true', label: 'AI Assistant', icon: Sparkles },
    { href: '/profile', label: 'Profile', icon: User }
  ];

  const handleInputResize = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
  };

  const orbState = useMemo(() => {
    if (toolProgress?.status === 'running') return 'active';
    if (isSearchingWeb) return 'thinking';
    if (isLoading && !streamingMessageId) return 'thinking';
    if (isLoading) return 'active';
    return 'idle';
  }, [toolProgress, isSearchingWeb, isLoading, streamingMessageId]);

  const progressPercent = toolProgress?.total
    ? Math.min(100, Math.round((toolProgress.completed / toolProgress.total) * 100))
    : null;

  return (
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-transparent overflow-hidden">
        {/* Agent Status Panel (Right Sidebar) */}
        <AgentSummary status={orbState} sessionActivity={sessionActivity} toolProgress={toolProgress} />

        {/* Chat Container */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={chatKey}
            ref={chatContainerRef}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex-1 overflow-y-auto w-full z-10 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
            style={{ paddingTop: '33px', paddingBottom: '120px', overflowAnchor: 'none' }}
          >
          <AnimatePresence mode="wait">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center pb-20">
                <h1 className="font-medium text-white tracking-tight leading-tight mb-8" style={{ fontSize: '55px' }}>
                  What can I help with?
                </h1>
                
                <div className="min-h-[100px] flex items-center justify-center w-full">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="flex flex-wrap justify-center gap-2.5 max-w-2xl"
                >
                  {chipsLoading && (
                    <>
                      {[1, 2, 3, 4].map((i) => (
                        <motion.div
                          key={i}
                          className="px-5 py-2.5 bg-zinc-800/40 border border-zinc-700/40 rounded-xl"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: [0.5, 0.8, 0.5], scale: 1 }}
                          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
                          style={{ minWidth: '120px', height: '42px' }}
                        />
                      ))}
                    </>
                  )}
                  <AnimatePresence mode="popLayout">
                  {!chipsLoading && chips.map((suggestion, i) => (
                    <motion.button
                      key={`${suggestion}-${i}`}
                      type="button"
                      initial={{ opacity: 0, scale: 0.8, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ 
                        type: 'spring', 
                        damping: 20, 
                        stiffness: 300, 
                        delay: i * 0.08 
                      }}
                      onClick={() => submitPrompt(suggestion)}
                      whileHover={{ scale: 1.05, y: -2, backgroundColor: 'rgba(39, 39, 42, 0.9)' }}
                      whileTap={{ scale: 0.95 }}
                      className="px-5 py-2.5 bg-zinc-800/60 border border-zinc-700/60 hover:border-zinc-500 rounded-xl text-zinc-200 hover:text-white text-[15px] font-medium shadow-sm hover:shadow-lg cursor-pointer backdrop-blur-sm"
                    >
                      {suggestion}
                    </motion.button>
                  ))}
                  </AnimatePresence>
                </motion.div>
                </div>
              </div>
            )}
          </AnimatePresence>

          <motion.div 
            className="w-full py-7"
            style={{ gap: '55px', display: 'flex', flexDirection: 'column' }}
          >
            {messages.map((msg) => (
              <div key={msg.id} className="w-full">
                <div className="max-w-3xl mx-auto" style={{ paddingLeft: '22px', paddingRight: '33px' }}>
                  <div className={clsx("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")} style={{ gap: '5.5px' }}>
                    {msg.role === 'user' ? (
                      <div style={{ padding: '12px 24px', fontSize: '16px' }} className="bg-white/5 backdrop-blur-xl border border-white/10 text-white rounded-[24px] rounded-tr-sm max-w-[85%] leading-relaxed shadow-lg">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="w-full prose prose-invert max-w-none prose-lg break-words">
                        {(() => {
                          const { thinking, content: mainContent, isFinished } = extractThinking(msg.content, msg.thinkingStarted);
                          const displayContent = msg.id === streamingMessageId
                            ? processStreamingContent(mainContent)
                            : stripMediaGrid(mainContent) || ' ';

                          const segments = parseMediaSegments(displayContent);

                          return (
                            <>
                              {thinking && isFinished && <ThinkingExpandable content={thinking} isFinished={isFinished} />}

                              {/* Stream Card */}
                              {msg.streamCard && (
                                <div className="mb-6">
                                   <InlineStreamCard
                                      data={msg.streamCard}
                                      onPlay={(data) => setActiveStream({
                                        imdbId: data.imdb_id,
                                        season: data.season,
                                        episode: data.episode,
                                        type: data.media_type,
                                        title: data.title
                                      })}
                                   />
                                </div>
                              )}

                              {/* Favicon-only sources (top of response) - enhanced stack UI */}
                              {msg.sources && msg.sources.length > 0 && (
                                <div className="mb-6">
                                  <div className="flex items-center gap-3">
                                    {/* Stack of up to 4 favicons with overlap */}
                                    <div className="flex items-center relative h-10 w-fit">
                                      {msg.sources.slice(0, 4).map((source, index) => {
                                        const favicon = getFaviconUrl(source.url);
                                        return favicon ? (
                                          <a
                                            key={`${source.url}-${index}`}
                                            href={source.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="group relative"
                                            title={source.title || source.url}
                                            style={{ zIndex: msg.sources.length - index, marginLeft: index > 0 ? '-8px' : '0' }}
                                          >
                                            <motion.img
                                              initial={{ opacity: 0, scale: 0.6 }}
                                              animate={{ opacity: 1, scale: 1 }}
                                              transition={{ delay: index * 0.08, duration: 0.35 }}
                                              src={favicon}
                                              alt={source.title || 'source'}
                                              className="w-8 h-8 rounded-full border-2 border-zinc-900 hover:border-white hover:shadow-lg transition-all cursor-pointer ring-1 ring-zinc-700/50"
                                              loading="lazy"
                                            />
                                            <div className="hidden group-hover:block absolute -bottom-9 left-1/2 -translate-x-1/2 bg-zinc-800 text-zinc-200 text-xs px-3 py-1.5 rounded-lg whitespace-nowrap border border-zinc-700 z-50 pointer-events-none font-medium shadow-lg">
                                              {source.title ? source.title.slice(0, 35) : 'Source'}
                                            </div>
                                          </a>
                                        ) : null;
                                      })}
                                    </div>

                                    {/* Expander button if more sources */}
                                    {msg.sources.length > 4 && (
                                      <motion.button
                                        onClick={() => setExpandSources(!expandSources)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-all border border-zinc-700/50 hover:border-zinc-600 flex items-center gap-1.5"
                                      >
                                        <span>+{msg.sources.length - 4}</span>
                                        <motion.svg
                                          animate={{ rotate: expandSources ? 180 : 0 }}
                                          transition={{ duration: 0.2 }}
                                          className="w-3 h-3"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                        </motion.svg>
                                      </motion.button>
                                    )}
                                  </div>

                                  {/* Expanded sources grid */}
                                  <AnimatePresence>
                                    {expandSources && msg.sources.length > 4 && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="mt-3 flex flex-wrap gap-2"
                                      >
                                        {msg.sources.slice(4).map((source, index) => {
                                          const favicon = getFaviconUrl(source.url);
                                          return favicon ? (
                                            <a
                                              key={`${source.url}-${index + 4}`}
                                              href={source.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="group relative"
                                              title={source.title || source.url}
                                            >
                                              <motion.img
                                                initial={{ opacity: 0, scale: 0.6 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                                src={favicon}
                                                alt={source.title || 'source'}
                                                className="w-7 h-7 rounded-full border border-zinc-700 hover:border-white hover:shadow-md transition-all cursor-pointer"
                                                loading="lazy"
                                              />
                                              <div className="hidden group-hover:block absolute -bottom-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded whitespace-nowrap border border-zinc-700 z-50 pointer-events-none">
                                                {source.title ? source.title.slice(0, 30) : 'Source'}
                                              </div>
                                            </a>
                                          ) : null;
                                        })}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              )}

                              <div className={clsx(thinking && !isFinished ? "opacity-0 h-0 overflow-hidden" : "opacity-100 h-auto transition-opacity duration-500")}>
                                {segments.length === 0 ? (
                                  <MessageMarkdown content={displayContent} />
                                ) : (
                                  segments.map((segment, idx) => {
                                    if (segment.type === 'text') {
                                      return <MessageMarkdown key={`text-${idx}`} content={segment.content} />;
                                    }
                                    if (segment.type === 'media' && Array.isArray(segment.items)) {
                                      return (
                                        <div key={`media-${idx}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 my-6">
                                          {segment.items.map((item, itemIndex) => (
                                            <InlineMediaCard
                                              key={`${item.id || item.title}-${itemIndex}`}
                                              id={item.id}
                                              title={item.title}
                                              year={item.year}
                                              reason={item.reason}
                                              index={itemIndex}
                                            />
                                          ))}
                                        </div>
                                      );
                                    }
                                    return null;
                                  })
                                )}

                                {msg.isAuthPrompt && (
                                  <AuthPrompt onSuccess={() => {
                                    setHasToken(true);
                                    // Optionally add a success message
                                    setMessages(prev => [...prev, {
                                      role: 'assistant',
                                      id: Date.now().toString(),
                                      content: "Authentication successful! I'm now ready to help you with movie and TV show recommendations."
                                    }]);
                                  }} />
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    
                    {msg.role === 'assistant' && msg.id === streamingMessageId && (() => {
                      const { content: mainContent, thinking: hasThinking } = extractThinking(msg.content, msg.thinkingStarted);
                      return !processStreamingContent(mainContent) && !hasThinking && !isSearchingWeb;
                    })() && (
                      <div className="pt-2">
                        <div className="thinking-indicator">
                          <span className="thinking-text">Thinking...</span>
                        </div>
                      </div>
                    )}


                    {toolProgress?.status === 'running' && msg.role === 'assistant' && msg.id === streamingMessageId && (
                      <div className="mt-4 w-full max-w-sm bg-black/40 border border-white/10 rounded-lg p-3 backdrop-blur-sm relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent animate-scanline pointer-events-none" />
                        <div className="flex items-center gap-3 relative z-10">
                           <div className="w-8 h-8 rounded border border-white/20 flex items-center justify-center bg-white/5 shrink-0">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                 <span className="text-xs font-mono text-white uppercase tracking-wider font-bold truncate">
                                    {toolProgress.tool === 'web_search' ? 'NET_LINK' : 'SYS_OP'}: {toolProgress.tool?.toUpperCase().replace(/_/g, ' ')}
                                 </span>
                                 <span className="text-xs font-mono text-zinc-400 shrink-0 ml-2">
                                    {toolProgress.total ? `${Math.round((toolProgress.completed / toolProgress.total) * 100)}%` : 'RUNNING'}
                                 </span>
                              </div>
                              <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden flex gap-0.5">
                                  <div 
                                    className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-300 ease-out relative"
                                    style={{ width: toolProgress.total ? `${progressPercent}%` : '100%' }}
                                  >
                                     <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer-fast" />
                                  </div>
                              </div>
                           </div>
                        </div>
                      </div>
                    )}

                    
                     {/* Action buttons */}
                    {msg.role === 'assistant' && msg.id !== streamingMessageId && msg.content && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                        className="flex items-center w-full"
                        style={{ gap: '6px', marginTop: '22px', paddingTop: '0' }}
                      >
                         <button onClick={() => navigator.clipboard.writeText(msg.content)} className="flex items-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all" style={{ gap: '6px', padding: '6px 11px', fontSize: '13px' }}>
                            <Copy size={15} />
                         </button>
                         <button onClick={() => {}} className="flex items-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all" style={{ gap: '6px', padding: '6px 11px', fontSize: '13px' }}>
                             <Share2 size={15} />
                         </button>
                          <button onClick={() => {
                              const messageIndex = messages.findIndex(m => m.id === msg.id);
                              if (messageIndex > 0) {
                                const previousUserMessage = messages[messageIndex - 1];
                                if (previousUserMessage?.role === 'user') {
                                    setMessages(prev => prev.slice(0, messageIndex));
                                    setInput(previousUserMessage.content);
                                }
                              }
                          }} className="flex items-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all" style={{ gap: '6px', padding: '6px 11px', fontSize: '13px' }}>
                              <RotateCcw size={15} />
                          </button>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
          <div ref={messagesEndRef} style={{ height: '22px', overflowAnchor: 'auto' }} />
          </motion.main>
        </AnimatePresence>
        
        {/* Scroll to bottom */}
        <AnimatePresence>
          {showScrollButton && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToBottom}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[65] bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full shadow-lg transition-colors"
              style={{ padding: '8.8px' }}
            >
              <ArrowDown size={22} className="text-zinc-300" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-6 left-0 right-0 z-[70] bg-transparent pointer-events-none" 
        >
          <div className="w-full flex justify-center pointer-events-auto">
            <div className="bg-[#0a0a0a]/80 backdrop-blur-2xl border border-white/10 p-2.5 rounded-full shadow-2xl flex items-center gap-3 w-fit transition-all duration-500 ease-out hover:border-white/20 hover:bg-[#0a0a0a]/90 ring-1 ring-white/10">
              <div className="flex items-center gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isProfile = item.href.startsWith('/profile');
                  const isAI = item.href.startsWith('/ai');
                  const basePath = item.href.split('?')[0];
                  const isActive = basePath === '/' ? pathname === '/' : pathname.startsWith(basePath);

                  if (isProfile) return null;

                  if (isAI) {
                    const isNewChatPage = pathname === '/ai';
                    return (
                      <div key={item.href} className="flex items-center">
                        <button
                          onClick={() => {
                            if (isNewChatPage) return; // Disable toggle on new chat page
                            if (isSearchExpanded) {
                              setAllowOverflow(false);
                              setIsSearchExpanded(false);
                            } else {
                              setIsSearchExpanded(true);
                            }
                          }}
                          className={clsx(
                            'rounded-full transition-all duration-300 flex items-center justify-center flex-shrink-0 z-20',
                            (isSearchExpanded) ? 'bg-white text-black p-2 scale-105' : (isActive ? 'bg-white text-black p-2' : 'text-white hover:bg-zinc-800 p-2'),
                            isNewChatPage && 'cursor-default'
                          )}
                          title="AI Assistant"
                        >
                          <Icon size={20} />
                        </button>
                        
                        <AnimatePresence>
                          {isSearchExpanded && (
                            <motion.form 
                              initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                              animate={{ width: "auto", opacity: 1, marginLeft: 12 }}
                              exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                              transition={{ type: "spring", stiffness: 400, damping: 30 }}
                              onAnimationComplete={(definition) => {
                                if (typeof definition === 'object' && definition.width === "auto") {
                                  setAllowOverflow(true);
                                }
                              }}
                              style={{ overflow: allowOverflow ? 'visible' : 'hidden' }}
                              onSubmit={handleSubmit} 
                              className="relative flex items-center h-full origin-left"
                            >
                                <div className="flex items-center gap-3 min-w-[340px]">
                                  {/* Model Picker */}
                                  <div className="relative" ref={modelPickerRef}>
                                    <button
                                      type="button"
                                      onClick={() => setShowModelPicker(!showModelPicker)}
                                      className="flex items-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-lg p-2 transition-all focus:outline-none font-medium text-sm whitespace-nowrap gap-1.5"
                                    >
                                      <span className="max-w-[120px] truncate">{models.find((m) => m.id === selectedModel)?.name || 'GPT-4.1'}</span>
                                      <CaretDown size={14} className={clsx("transition-transform duration-200", showModelPicker ? "rotate-180" : "")} />
                                    </button>
                                    <AnimatePresence>
                                      {showModelPicker && models.length > 0 && (
                                        <motion.div
                                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                          animate={{ opacity: 1, y: 0, scale: 1 }}
                                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                          transition={{ duration: 0.15 }}
                                          className="absolute bottom-full left-0 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl z-[80] max-h-[300px] overflow-y-auto"
                                          style={{ marginBottom: '16px' }}
                                        >
                                          <div className="uppercase font-bold text-zinc-500 tracking-wider px-3 py-2 text-[10px]">Select Model</div>
                                          {models.map((model) => (
                                            <button
                                              key={model.id}
                                              type="button"
                                              onClick={() => { setSelectedModel(model.id); setShowModelPicker(false); }}
                                              className="w-full text-left hover:bg-zinc-800/80 flex items-center justify-between px-3 py-2.5 transition-colors duration-150 text-base text-zinc-300 hover:text-white"
                                            >
                                              <span>{model.name}</span>
                                              {selectedModel === model.id && <Check size={18} className="text-white" />}
                                            </button>
                                          ))}
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>

                                  <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={handleInputResize}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isLoading) handleSubmit(e); } }}
                                    placeholder="Ask anything..."
                                    className="flex-1 bg-transparent text-white placeholder-zinc-500 focus:outline-none resize-none overflow-hidden leading-6 py-1 h-[24px] max-h-[100px] text-base"
                                    rows={1}
                                  />
                                  
                                  <button
                                    type="submit"
                                    disabled={isLoading || !input.trim()}
                                    className={clsx("rounded-full p-2.5 transition-all shrink-0", input.trim() ? "text-white hover:bg-zinc-700" : "text-zinc-600 cursor-not-allowed")}
                                  >
                                    {isLoading ? <Spinner size={20} className="animate-spin" /> : <PaperPlaneRight size={20} weight="fill" />}
                                  </button>
                                </div>
                            </motion.form>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  }
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={clsx('rounded-full transition-colors flex items-center justify-center flex-shrink-0', isActive ? 'bg-white text-black p-2' : 'text-white hover:bg-zinc-800 p-2')}
                    >
                      <Icon size={20} />
                    </Link>
                  );
                })}
              </div>

              {/* Profile */}
              <div className="pl-2 border-l border-zinc-700/50 ml-1">
                {navItems.filter(i => i.href.startsWith('/profile')).map(item => (
                  <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={clsx('rounded-full transition-colors flex items-center justify-center flex-shrink-0 p-[3px] overflow-hidden border border-zinc-700 w-[38px] h-[38px] hover:border-zinc-500')}
                    >
                      {session?.user?.image ? (
                        <Image width={32} height={32} src={session.user.image} alt={session.user.name || 'Profile'} className="w-[32px] h-[32px] rounded-full object-cover" />
                      ) : (
                        <User size={20} className="text-white" />
                      )}
                    </Link>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stream Player Overlay */}
        <AnimatePresence>
          {activeStream && (
             <StreamPlayer
                {...activeStream}
                onClose={() => setActiveStream(null)}
             />
          )}
        </AnimatePresence>
      </div>    
  );
}
