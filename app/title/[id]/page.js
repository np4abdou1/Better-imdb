'use client';
import { useState, useEffect, use, useRef } from 'react';
import { getTitleDetails, getTitleEpisodes, saveRating, getRating, getLists, addListItem, getTitleCredits, getTitleImages } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Clock, Calendar, ArrowLeft, PlayCircle, Plus, Check, Eye, Search, ChevronDown, Monitor, Film, Users, Image as ImageIcon, User } from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import Skeleton from '@/components/Skeleton';

export default function TitleDetails({ params }) {
  const { id } = use(params);
  
  const [title, setTitle] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [season, setSeason] = useState(1);
  const [loading, setLoading] = useState(true);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [jumpToEp, setJumpToEp] = useState('');
  const [jumping, setJumping] = useState(false);
  
  // Watch Status State
  const [lists, setLists] = useState([]);
  const [activeStatus, setActiveStatus] = useState(null);
  
  // Credits and Media
  const [credits, setCredits] = useState([]);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [images, setImages] = useState([]);
  const [showCredits, setShowCredits] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  const episodeRefs = useRef({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const titleData = await getTitleDetails(id);
        setTitle(titleData);
        
        if (titleData?.type === 'tvSeries' || titleData?.type === 'tvMiniSeries') {
           setShowEpisodes(true);
           fetchEpisodes(1, true);
        }

        // Try to get rating, but don't fail if it errors
        try {
          const ratingData = await getRating(id);
          if (ratingData?.score !== undefined) {
            setUserRating(ratingData.score);
          }
        } catch (ratingError) {
          console.warn('Could not load rating:', ratingError);
          // Continue without rating
        }

        const listsData = await getLists();
        setLists(listsData);
        
        // Load credits
        setCreditsLoading(true);
        try {
          const creditsData = await getTitleCredits(id);
          if (creditsData?.credits) {
            setCredits(creditsData.credits);
            setShowCredits(true);
          }
        } catch (e) {
          console.warn('Could not load credits:', e);
        } finally {
          setCreditsLoading(false);
        }
        
        // Load images
        try {
          const imagesData = await getTitleImages(id);
          if (imagesData?.images && imagesData.images.length > 0) {
            setImages(imagesData.images);
            setShowImages(true);
          }
        } catch (e) {
          console.warn('Could not load images:', e);
        }
      } catch (e) {
        console.error('Error loading title details:', e);
        // Set loading to false even on error so user sees something
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const fetchEpisodes = async (seasonNum, reset = false) => {
    if (reset) {
      setEpisodesLoading(true);
      setEpisodes([]);
    } else {
      setLoadingMore(true);
    }
    
    setSeason(seasonNum);
    
    try {
      const token = reset ? null : nextPageToken;
      const epData = await getTitleEpisodes(id, seasonNum, token);
      
      const newEpisodes = epData.episodes || [];
      if (reset) {
        setEpisodes(newEpisodes);
      } else {
        setEpisodes(prev => [...prev, ...newEpisodes]);
      }
      setNextPageToken(epData.nextPageToken);
    } catch (e) {
      console.error(e);
      if (reset) setEpisodes([]);
    } finally {
      setEpisodesLoading(false);
      setLoadingMore(false);
    }
  };

  const handleRate = async (e) => {
    const score = parseFloat(e.target.value);
    setUserRating(score);
    try {
      await saveRating(id, score, '');
    } catch (error) {
      console.error('Failed to save rating:', error);
      // Optionally show a toast/notification to user
      // For now, we'll just log it - the UI state is already updated
    }
  };

  const handleStatusChange = async (statusListName) => {
    setActiveStatus(statusListName);
    const targetList = lists.find(l => l.name === statusListName);
    if (targetList) {
      try {
        await addListItem(targetList.id, id);
      } catch (error) {
        console.error('Failed to add item to list:', error);
        // Revert status on error
        setActiveStatus(null);
        // Optionally show error message to user
      }
    }
  };

  const scrollToEpisode = (epNum) => {
    const target = episodeRefs.current[epNum];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('ring-2', 'ring-white');
      setTimeout(() => target.classList.remove('ring-2', 'ring-white'), 2000);
      return true;
    }
    return false;
  };

  const handleJumpSubmit = async (e) => {
    e.preventDefault();
    if (!jumpToEp) return;
    const targetEp = parseInt(jumpToEp);
    if (scrollToEpisode(targetEp)) return;

    if (nextPageToken && !jumping) {
      setJumping(true);
      let currentToken = nextPageToken;
      let found = false;
      for (let i = 0; i < 10; i++) {
        setLoadingMore(true); 
        try {
          const epData = await getTitleEpisodes(id, season, currentToken);
          const newEpisodes = epData.episodes || [];
          setEpisodes(prev => [...prev, ...newEpisodes]);
          currentToken = epData.nextPageToken;
          setNextPageToken(currentToken); 
          const hit = newEpisodes.find(ep => ep.episodeNumber === targetEp);
          if (hit) {
            found = true;
            setTimeout(() => scrollToEpisode(targetEp), 500); 
            break;
          }
          if (!currentToken) break; 
        } catch (err) {
          console.error(err);
          break;
        }
      }
      setJumping(false);
      setLoadingMore(false);
      if (!found) alert(`Episode ${targetEp} not found in available pages.`);
    } else {
       alert(`Episode ${targetEp} not loaded or not found.`);
    }
  };

  if (loading) return (
    <div className="min-h-screen px-6 md:px-12 py-12">
      <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-16"></div>
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-10 lg:gap-16">
          <div className="aspect-[2/3] bg-white/10 rounded-lg"></div>
          <div className="space-y-6">
            <div className="h-14 bg-white/10 rounded w-3/4"></div>
            <div className="h-4 bg-white/10 rounded w-1/2"></div>
            <div className="h-20 bg-white/10 rounded w-full"></div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!title) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-white space-y-4">
      <h2 className="text-4xl font-bold">Title not found</h2>
      <Link href="/" className="text-zinc-400 hover:text-white underline underline-offset-4">Return Home</Link>
    </div>
  );

  return (
    <div className="min-h-screen text-white selection:bg-white selection:text-black">
      {/* Background Ambience */}
      <div className="fixed inset-0 z-[-1] bg-black">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-white/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-zinc-900/40 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-[77rem] mx-auto px-6 md:px-12 pt-6 pb-20">
        {/* Back Button - Above both columns */}
        <Link href="/" className="lg:sticky lg:top-6 inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group text-base font-medium mb-6 z-10 relative">
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span>Back</span>
        </Link>

        <div className="flex gap-12 items-start">
          {/* LEFT COLUMN: Sticky Poster */}
          <div className="lg:sticky lg:top-6 self-start h-fit mb-6 lg:mb-0 lg:w-[320px] flex-shrink-0">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
            >
              {/* Poster - Smaller */}
              <div className="rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-zinc-900 aspect-[2/3] relative group" style={{ maxWidth: '320px' }}>
                <img 
                  src={title.primaryImage?.url} 
                  alt={title.primaryTitle}
                  className="w-full h-full object-cover grayscale-[15%] group-hover:grayscale-0 transition-all duration-700"
                />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
              </div>
            </motion.div>
          </div>

          {/* RIGHT COLUMN: Content aligned with poster top */}
          <div className="flex-1 min-w-0">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col gap-12 pt-2"
            >
              
              {/* 1. Title Details Section */}
              <div className="space-y-6">
              <div className="space-y-3">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
                  {title.primaryTitle}
                </h1>
                
                {/* Metadata Row */}
                <div className="flex flex-wrap items-center gap-3 text-zinc-400 text-xs md:text-sm">
                  <span className="bg-white/10 text-white font-semibold px-2.5 py-1 rounded text-xs uppercase tracking-wide border border-white/20">
                    {title.type === 'tvSeries' ? 'TV Series' : 'Movie'}
                  </span>
                  <span className="text-zinc-500">•</span>
                  <span className="flex items-center gap-1.5"><Calendar size={14} /> {title.startYear}</span>
                  {title.runtimeSeconds && (
                    <>
                      <span className="text-zinc-500">•</span>
                      <span className="flex items-center gap-1.5"><Clock size={14} /> {Math.floor(title.runtimeSeconds/60)} min</span>
                    </>
                  )}
                  
                  {title.rating && (
                    <>
                      <span className="text-zinc-500">•</span>
                      <div className="flex items-center gap-1.5">
                        <Star size={14} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-white font-semibold">{title.rating.aggregateRating}</span>
                        <span className="text-zinc-600">/10</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <p className="text-sm md:text-base text-zinc-300 leading-relaxed">
                {title.plot || "No plot synopsis available for this title."}
              </p>

              {/* Genres */}
              <div className="flex gap-1.5 flex-wrap pt-2">
                {title.genres?.map(genre => (
                  <span key={genre} className="px-3 py-1 rounded-full border border-white/15 text-zinc-400 text-xs hover:border-white/40 hover:bg-white/5 transition-all cursor-default">
                    {genre}
                  </span>
                ))}
              </div>

              {/* Status Buttons */}
              <div className="flex flex-wrap gap-2 border-b border-white/5 pb-6">
                {[
                  { label: 'To Watch', icon: Plus, name: 'To Watch' },
                  { label: 'Watching', icon: Monitor, name: 'Watching' },
                  { label: 'Watched', icon: Check, name: 'Watched' }
                ].map((status) => (
                   <button
                     key={status.label}
                     onClick={() => handleStatusChange(status.name)}
                     className={clsx(
                       "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-all duration-200 font-medium",
                       activeStatus === status.name 
                         ? "bg-white text-black border-white" 
                         : "bg-white/5 border-white/20 text-zinc-300 hover:border-white/40 hover:bg-white/10"
                     )}
                   >
                     <status.icon size={14} />
                     <span>{status.label}</span>
                   </button>
                ))}
              </div>

              {/* Rating Control */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 justify-between">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Your Rating</label>
                  {userRating > 0 && (
                    <span className="text-lg font-bold text-white">{userRating.toFixed(1)}/10</span>
                  )}
                </div>
                <input 
                   type="range" min="0" max="10" step="0.1" 
                   value={userRating || 0} onChange={handleRate}
                   className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-white"
                 />
              </div>
            </div>

            {/* 2. Credits Section */}
            {showCredits && credits.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="pt-4 border-t border-white/5"
              >
                <h2 className="text-2xl font-bold text-white tracking-tight mb-6">Cast & Crew</h2>
                
                {creditsLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} className="space-y-2">
                        <div className="aspect-[2/3] bg-white/5 rounded-lg animate-pulse" />
                        <div className="h-4 bg-white/5 rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {credits.slice(0, 12).map((credit, i) => (
                      <motion.div
                        key={`${credit.name?.id}-${i}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="group"
                      >
                        <div className="space-y-2">
                          <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900/50 border border-white/10 group-hover:border-white/30 transition-all duration-300 group-hover:shadow-xl">
                            {credit.name?.primaryImage?.url ? (
                              <>
                                {/* Category Badge - Top */}
                                {credit.category && (
                                  <div className="absolute top-2 left-2 z-10 bg-black/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/20">
                                    <p className="text-[10px] text-white font-semibold uppercase tracking-wide">
                                      {credit.category}
                                    </p>
                                  </div>
                                )}
                                <div className="w-full h-full overflow-hidden">
                                  <img 
                                    src={credit.name.primaryImage.url} 
                                    alt={credit.name.displayName}
                                    className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-300"
                                    style={{ transform: 'scale(1.2)', transformOrigin: 'center center' }}
                                  />
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-800/90 to-zinc-900 relative">
                                {/* Category Badge - Top */}
                                {credit.category && (
                                  <div className="absolute top-2 left-2 z-10 bg-black/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/20">
                                    <p className="text-[10px] text-white font-semibold uppercase tracking-wide">
                                      {credit.category}
                                    </p>
                                  </div>
                                )}
                                {/* Initials Circle - Enhanced */}
                                <div className="relative">
                                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-white/20 to-white/5 border-2 border-white/30 flex items-center justify-center shadow-lg">
                                    {credit.name?.displayName ? (
                                      <span className="text-2xl font-bold text-white">
                                        {credit.name.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                      </span>
                                    ) : (
                                      <User size={32} className="text-white/60" />
                                    )}
                                  </div>
                                  {/* Decorative ring */}
                                  <div className="absolute inset-0 rounded-full border-2 border-white/10 scale-110" />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white line-clamp-1 group-hover:text-zinc-100 transition-colors">
                              {credit.name?.displayName || 'Unknown'}
                            </p>
                            {credit.characters && credit.characters.length > 0 && (
                              <p className="text-xs text-zinc-400 line-clamp-1 italic">
                                {credit.characters[0]}
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* 3. Images Gallery - Bigger with Preview */}
            {showImages && images.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="pt-4 border-t border-white/5"
              >
                <h2 className="text-2xl font-bold text-white tracking-tight mb-6">Images</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-6">
                  {images.slice(0, 9).map((image, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="group relative aspect-[16/9] rounded-xl overflow-hidden bg-zinc-900/50 border border-white/10 hover:border-white/30 transition-all cursor-pointer"
                      onClick={() => {
                        setSelectedImage(image);
                        setImageModalOpen(true);
                      }}
                      onMouseEnter={() => setSelectedImage(image)}
                    >
                      <img 
                        src={image.url} 
                        alt={`Image ${i + 1}`}
                        className="w-full h-full object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Image Preview Modal */}
            <AnimatePresence>
              {imageModalOpen && selectedImage && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
                  onClick={() => setImageModalOpen(false)}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="relative max-w-7xl max-h-[90vh]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img 
                      src={selectedImage.url} 
                      alt="Preview"
                      className="max-w-full max-h-[90vh] object-contain rounded-lg"
                    />
                    <button
                      onClick={() => setImageModalOpen(false)}
                      className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white border border-white/20 transition-all"
                    >
                      ×
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 4. Episodes Section (Only renders if series) */}
            {showEpisodes && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="pt-4"
              >
                {/* Episodes Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Episodes</h2>
                    <p className="text-xs text-zinc-500 mt-1">Season {season}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Season Navigation */}
                    <div className="flex items-center gap-1 bg-white/5 rounded-lg border border-white/10 p-1">
                      <button 
                        onClick={() => fetchEpisodes(Math.max(1, season - 1), true)}
                        disabled={season <= 1}
                        className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded disabled:opacity-20 transition-colors"
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <span className="px-3 font-mono font-bold text-sm min-w-[2.5ch] text-center">S{season}</span>
                      <button 
                        onClick={() => fetchEpisodes(season + 1, true)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded transition-colors"
                      >
                        <ArrowLeft size={14} className="rotate-180" />
                      </button>
                    </div>

                    {/* Episode Jump */}
                    <form onSubmit={handleJumpSubmit} className="flex items-center gap-1 bg-white/5 rounded-lg border border-white/10 px-2">
                      <input 
                        type="number" 
                        placeholder="Ep" 
                        value={jumpToEp}
                        onChange={(e) => setJumpToEp(e.target.value)}
                        className="w-12 bg-transparent px-1 py-1.5 text-white placeholder-zinc-600 focus:outline-none text-center font-mono text-sm transition-colors"
                      />
                      <button type="submit" className="p-1.5 rounded hover:bg-white/20 transition-colors" disabled={jumping}>
                        {jumping ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"/> : <Search size={14} />}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Episodes List - Redesigned */}
                {episodesLoading && !jumping ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {[1,2,3,4].map(i => (
                       <div key={i} className="bg-white/5 rounded-xl h-48 animate-pulse border border-white/10" />
                     ))}
                   </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {episodes.map((ep, i) => (
                      <motion.div 
                        key={ep.id}
                        ref={(el) => (episodeRefs.current[ep.episodeNumber] = el)}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.05 }}
                        className="group relative rounded-xl overflow-hidden bg-black/40 backdrop-blur-sm border border-white/10 hover:border-white/30 transition-all duration-300 hover:scale-[1.02] scroll-mt-20"
                      >
                        {/* Episode Image - Full Width */}
                        <div className="relative aspect-video w-full overflow-hidden bg-zinc-900">
                          {ep.primaryImage?.url ? (
                            <img 
                              src={ep.primaryImage.url} 
                              alt={ep.title}
                              className="w-full h-full object-cover grayscale-[15%] group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                              <PlayCircle size={32} className="text-zinc-700" />
                            </div>
                          )}
                          {/* Episode Number Badge */}
                          <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/20">
                            <span className="text-xs font-bold text-white">EP {ep.episodeNumber}</span>
                          </div>
                          {/* Rating Badge */}
                          {ep.rating && (
                            <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-white/20 flex items-center gap-1.5">
                              <Star size={12} className="fill-white text-white" />
                              <span className="text-xs font-bold text-white">{ep.rating.aggregateRating}</span>
                            </div>
                          )}
                          {/* Gradient Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                        </div>
                        
                        {/* Episode Info */}
                        <div className="p-4 space-y-2">
                          <h4 className="font-bold text-white text-lg group-hover:text-zinc-100 transition-colors line-clamp-2">
                            {ep.title}
                          </h4>
                          
                          {ep.plot && (
                            <p className="text-zinc-400 text-sm line-clamp-2 leading-relaxed">
                              {ep.plot}
                            </p>
                          )}
                          
                          {ep.releaseDate && (
                            <div className="flex items-center gap-2 text-xs text-zinc-500 pt-1">
                              <Calendar size={12} />
                              <span>
                                {typeof ep.releaseDate === 'object' && ep.releaseDate !== null ? 
                                  new Date(ep.releaseDate.year, ep.releaseDate.month - 1, ep.releaseDate.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) 
                                  : ep.releaseDate}
                              </span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                    
                    {nextPageToken && (
                      <div className="flex justify-center pt-6">
                        <button 
                          onClick={() => fetchEpisodes(season, false)}
                          disabled={loadingMore}
                          className="px-6 py-2 rounded-lg border border-white/20 hover:border-white/40 hover:bg-white/10 transition-all font-medium text-sm text-zinc-300 hover:text-white flex items-center gap-2 group"
                        >
                          {loadingMore ? (
                            <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-white rounded-full animate-spin"></div>
                          ) : (
                            <>
                              <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
                              More Episodes
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {episodes.length === 0 && (
                      <div className="text-center py-16 text-zinc-500 font-light text-sm">
                        No episodes found for Season {season}.
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
