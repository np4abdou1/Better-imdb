'use client';
import { useState, useEffect, use, useRef } from 'react';
import { getTitleDetails, getTitleEpisodes, saveRating, getRating, getLists, addListItem, getTitleCredits, getTitleImages, getTitleAwards, getTitleBoxOffice, getTitleLogo, getTitleSeasons } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Clock, Calendar, ArrowLeft, Play, Plus, Check, MagnifyingGlass, CaretDown, Monitor, FilmReel, UserCircle, Trophy, CurrencyDollar, PlayCircle } from '@phosphor-icons/react';
import { ChevronDown, Film } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import clsx from 'clsx';
import { BLUR_DATA_URL } from '@/lib/api-config';
import { amazonImageLoader } from '@/lib/amazon-image-loader';
import Skeleton from '@/components/Skeleton';

// Helper to get safe rating value
function getSafeRating(rating) {
  if (rating === undefined || rating === null) return null;
  if (typeof rating === 'number') return rating.toFixed(1);
  if (typeof rating === 'object') {
    return rating.aggregateRating || rating.rating || null;
  }
  return null;
}

export default function TitleDetails({ params }) {
  const { id } = use(params);

  const [title, setTitle] = useState(null);
  const [totalSeasons, setTotalSeasons] = useState(1);
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
  const [logo, setLogo] = useState(null);
  const [logoLoading, setLogoLoading] = useState(false);

  const [lists, setLists] = useState([]);
  const [activeStatus, setActiveStatus] = useState(null);

  const [credits, setCredits] = useState([]);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [images, setImages] = useState([]);
  const [showCredits, setShowCredits] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  const [awards, setAwards] = useState([]);
  const [boxOffice, setBoxOffice] = useState(null);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);

  const episodeRefs = useRef({});
  const seasonDropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(event.target)) {
        setShowSeasonDropdown(false);
      }
    };
    if (showSeasonDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSeasonDropdown]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch critical data first
        const titleData = await getTitleDetails(id);
        setTitle(titleData);
        
        // Fetch seasons to get accurate total season count
        let seasonCount = 1;
        if (titleData?.type === 'tvSeries' || titleData?.type === 'tvMiniSeries') {
          try {
            const seasonsData = await getTitleSeasons(id);
            if (seasonsData?.seasons && Array.isArray(seasonsData.seasons)) {
              seasonCount = seasonsData.seasons.length;
              console.log(`Fetched ${seasonCount} seasons for ${id}`);
            }
          } catch (error) {
            console.warn('Error fetching seasons, using fallback:', error);
            // Fallback to title data properties
            if (titleData?.totalSeasons) seasonCount = titleData.totalSeasons;
            else if (titleData?.numberOfSeasons) seasonCount = titleData.numberOfSeasons;
          }
        }
        setTotalSeasons(Math.max(1, seasonCount));

        if (titleData?.type === 'tvSeries' || titleData?.type === 'tvMiniSeries') {
          setShowEpisodes(true);
          fetchEpisodes(1, true);
        }

        // Fetch secondary data in parallel
        const [ratingData, listsData, creditsData, imagesData, awardsData, boxData, logoData] = await Promise.allSettled([
          getRating(id),
          getLists(),
          getTitleCredits(id),
          getTitleImages(id),
          getTitleAwards(id),
          getTitleBoxOffice(id),
          getTitleLogo(id)
        ]);

        if (ratingData.status === 'fulfilled' && ratingData.value?.score !== undefined) {
          setUserRating(ratingData.value.score);
        }

        if (listsData.status === 'fulfilled') {
          setLists(listsData.value);
        }

        if (creditsData.status === 'fulfilled' && creditsData.value?.credits) {
          setCredits(creditsData.value.credits);
          setShowCredits(true);
        }

        if (imagesData.status === 'fulfilled' && imagesData.value?.images?.length > 0) {
          setImages(imagesData.value.images);
          setShowImages(true);
        }

        if (awardsData.status === 'fulfilled' && awardsData.value?.awardNominations) {
          setAwards(awardsData.value.awardNominations);
        }

        if (boxData.status === 'fulfilled' && boxData.value) {
          setBoxOffice(boxData.value);
        }

        if (logoData.status === 'fulfilled' && logoData.value?.bestLogo) {
          setLogo(logoData.value.bestLogo);
        }

      } catch (e) {
        console.error('Error loading title details:', e);
      } finally {
        setLoading(false);
        setCreditsLoading(false);
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
        // Deduplicate: only add episodes that don't already exist
        setEpisodes(prev => {
          const existingIds = new Set(prev.map(ep => ep.id));
          const filtered = newEpisodes.filter(ep => !existingIds.has(ep.id));
          return [...prev, ...filtered];
        });
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
    }
  };

  const handleStatusChange = async (statusListName) => {
    const targetList = lists.find(l => l.name === statusListName);
    if (targetList) {
      try {
        const result = await addListItem(targetList.id, id);
        // Only set activeStatus if item was newly added, not if it already existed
        if (result.alreadyExists) {
          // Show brief feedback but don't keep status active
          setActiveStatus(statusListName);
          setTimeout(() => {
            setActiveStatus(null);
          }, 1200);
        } else {
          // Item was successfully added
          setActiveStatus(statusListName);
        }
      } catch (error) {
        console.error('Failed to add item to list:', error);
        setActiveStatus(null);
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
    <div className="min-h-screen">
      <div className="max-w-[77rem] mx-auto pt-8 mt-0 pb-20">
        <Skeleton className="h-6 w-16 rounded-full mb-4" />
        <div className="flex gap-12 items-start">
          <div className="hidden lg:block w-[280px]">
            <Skeleton className="aspect-[2/3] rounded-xl" />
          </div>
          <div className="flex-1 space-y-6">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
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
      <div className="fixed inset-0 z-[-1]" style={{ backgroundColor: '#0f0f0f' }}>
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-white/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-zinc-950/40 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-[77rem] mx-auto pt-8 mt-0 pb-20">
        
        <div className="flex flex-col lg:flex-row gap-12 items-start">
          <div className="w-full lg:w-[280px] flex-shrink-0 sticky top-8 self-start">
            <div className="space-y-6 z-20">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group text-base font-medium relative"
              >
                <Link href="/" className="inline-flex items-center gap-2">
                  <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                  <span>Back</span>
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="cursor-pointer"
              >
                <div className="rounded-xl overflow-hidden shadow-2xl border border-white/10 hover:border-white/30 bg-zinc-900 aspect-[2/3] relative group transition-all duration-300" style={{ maxWidth: '280px' }}>
                {title.primaryImage?.url ? (
                  <Image
                    src={title.primaryImage.url}
                    loader={amazonImageLoader}
                    alt={title.primaryTitle}
                    fill
                    priority
                    sizes="280px"
                    className="object-cover grayscale-[15%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/60 via-zinc-900 to-black relative overflow-hidden">
                    <div className="absolute inset-0 opacity-20">
                      <div className="absolute bottom-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
                    </div>
                    <Film size={52} className="text-zinc-600 opacity-60" />
                  </div>
                )}
                </div>
              </motion.div>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
              className="flex flex-col gap-6 pt-2"
            >
              <div className="space-y-4">
                {logo ? (
                  <div className="relative h-24 md:h-32 lg:h-40 w-full max-w-2xl">
                    <Image
                      src={logo}
                      loader={amazonImageLoader}
                      alt={title.primaryTitle}
                      fill
                      className="object-contain object-left"
                      priority
                    />
                  </div>
                ) : (
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
                    {title.primaryTitle}
                  </h1>
                )}
                <div className="flex flex-wrap items-center gap-3 text-zinc-400 text-sm">
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
                          <span className="text-white font-semibold">{title.rating.aggregateRating}/10</span>
                          <Star size={14} weight="fill" className="text-yellow-400" />
                        </div>
                      </>
                    )}
                  </div>
                <p className="text-sm md:text-base text-zinc-300 leading-relaxed mt-3">
                  {title.plot || "No plot synopsis available for this title."}
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {title.genres?.map((genre) => (
                    <span 
                      key={genre} 
                      className="px-3 py-1 rounded-full border border-white/15 text-zinc-400 text-xs cursor-default"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 border-b border-white/5 pb-4">
                  {title.type === 'movie' && (
                    <Link
                      href={`/watch/${id}`}
                      className="flex items-center gap-2 px-6 py-2 rounded-lg bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-colors shadow-lg shadow-white/10"
                    >
                      <Play size={16} weight="fill" />
                      <span>Watch Now</span>
                    </Link>
                  )}
                  
                  {[
                    { label: 'To Watch', icon: Plus, name: 'To Watch' },
                    { label: 'Watching', icon: Monitor, name: 'Watching' },
                    { label: 'Watched', icon: Check, name: 'Watched' }
                  ].map((status, idx) => (
                    <motion.button
                      key={status.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + idx * 0.08, duration: 0.4 }}
                      whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.15)" }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleStatusChange(status.name)}
                      className={clsx(
                        "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-all duration-200 font-medium",
                        activeStatus === status.name
                          ? "bg-white text-black border-white"
                          : "bg-white/5 border-white/20 text-zinc-300 hover:border-white/40"
                      )}
                    >
                      <status.icon size={14} />
                      <span>{status.label}</span>
                    </motion.button>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-3">
                  <label className="text-xs font-semibold text-zinc-400 uppercase whitespace-nowrap">Rate:</label>
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="range" min="0" max="10" step="0.1"
                      value={userRating || 0} onChange={handleRate}
                      className="w-full h-2 bg-zinc-800 rounded appearance-none cursor-pointer accent-yellow-400 transition-all [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg"
                    />
                    {userRating > 0 && (
                      <span className="text-sm font-bold text-white min-w-[2.5rem] text-right">{userRating.toFixed(1)}</span>
                    )}
                  </div>
                </div>
              </div>

              {(awards.length > 0 || boxOffice) && (
                <div className="flex gap-4 pt-2">
                  {awards.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20">
                      <Trophy size={16} className="text-yellow-400" />
                      <div className="text-xs">
                        <div className="font-semibold text-white">{awards.filter(a => a.isWinner).length} Wins</div>
                        <div className="text-zinc-400 text-[10px]">{awards.length} Noms</div>
                      </div>
                    </div>
                  )}
                  {boxOffice && boxOffice.worldwideGross && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20">
                      <CurrencyDollar size={16} className="text-green-400" />
                      <div className="text-xs">
                        <div className="font-semibold text-white">${(boxOffice.worldwideGross.amount / 1000000).toFixed(0)}M</div>
                        <div className="text-zinc-400 text-[10px]">Gross</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {false && (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {credits.slice(0, 12).map((credit, i) => (
                      <motion.div
                        key={`${credit.name?.id}-${i}`}
                        initial={{ opacity: 0, scale: 0.85, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.5 }}
                        whileHover={{ y: -8, scale: 1.05 }}
                        className="group"
                      >
                        <div className="space-y-2">
                          <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900/50 border border-white/10 group-hover:border-white/30 transition-all duration-300 group-hover:shadow-xl">
                            {credit.name?.primaryImage?.url ? (
                              <>
                                {credit.category && (
                                  <div className="absolute top-2 left-2 z-10 bg-black/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/20">
                                    <p className="text-[10px] text-white font-semibold uppercase tracking-wide">
                                      {credit.category}
                                    </p>
                                  </div>
                                )}
                                <Image
                                  src={credit.name.primaryImage.url}
                                  loader={amazonImageLoader}
                                  alt={credit.name.displayName}
                                  fill
                                  sizes="(max-width: 768px) 50vw, 16vw"
                                  className="object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-300 scale-110"
                                  loading="lazy"
                                  placeholder="blur"
                                  blurDataURL={BLUR_DATA_URL}
                                />
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/40 via-zinc-900/60 to-black relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                                {credit.category && (
                                  <div className="absolute top-2 left-2 z-10 bg-white/10 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/20 group-hover:bg-white/15 group-hover:border-white/30 transition-all">
                                    <p className="text-[10px] text-white/80 font-semibold uppercase tracking-wide">
                                      {credit.category}
                                    </p>
                                  </div>
                                )}
                                <div className="relative z-10 flex items-center justify-center">
                                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-white/12 to-white/3 border border-white/15 flex items-center justify-center group-hover:border-white/30 transition-all">
                                    <UserCircle size={28} className="text-white/35 group-hover:text-white/50 transition-colors" />
                                  </div>
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
                </div>
              )}

              {false && (
                <div>
                  <div className="hidden">
                    {images.slice(0, 9).map((image, i) => (
                        <Image
                          src={image.url}
                          loader={amazonImageLoader}
                          alt={`Image ${i + 1}`}
                          fill
                          sizes="(max-width: 768px) 50vw, 33vw"
                          className="object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-300 group-hover:scale-105"
                          loading="lazy"
                          placeholder="blur"
                          blurDataURL={BLUR_DATA_URL}
                        />
                      ))}
                  </div>
                </div>
              )}

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
                      className="relative max-w-7xl max-h-[90vh] w-full h-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Image
                        src={selectedImage.url}
                        loader={amazonImageLoader}
                        alt="Preview"
                        fill
                        className="object-contain rounded-lg"
                        sizes="100vw"
                      />
                      <button
                        onClick={() => setImageModalOpen(false)}
                        className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white border border-white/20 transition-all z-10"
                      >
                        ×
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {showEpisodes && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.35 }}
                  className="pt-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-white tracking-tight mb-1">Episodes</h2>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>Season {season}</span>
                        <span>•</span>
                        <span>{episodes.length} episode{episodes.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Custom Season Dropdown */}
                      <div className="relative" ref={seasonDropdownRef}>
                        <button
                          onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-white font-medium text-sm min-w-[140px] justify-between group"
                        >
                          <div className="flex items-center gap-2">
                            <Monitor size={14} className="text-zinc-400 group-hover:text-white transition-colors" />
                            <span>Season {season}</span>
                          </div>
                          <CaretDown size={12} className={`text-zinc-500 group-hover:text-white transition-all duration-200 ${showSeasonDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        
                        <AnimatePresence>
                          {showSeasonDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: -8, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -8, scale: 0.98 }}
                              transition={{ duration: 0.15, ease: "easeOut" }}
                              className="absolute top-full mt-1.5 left-0 w-full min-w-[160px] bg-[#18181b] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-50 ring-1 ring-white/5"
                            >
                              <div className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent py-1">
                                {[...Array(totalSeasons)].map((_, i) => (
                                  <button
                                    key={i + 1}
                                    onClick={() => {
                                      if (season !== i + 1) {
                                        fetchEpisodes(i + 1, true);
                                        setShowSeasonDropdown(false);
                                      }
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm transition-all flex items-center justify-between group/item ${
                                      season === i + 1
                                        ? 'bg-white/10 text-white font-medium mx-1 rounded-lg w-[calc(100%-8px)]'
                                        : 'text-zinc-400 hover:bg-white/5 hover:text-white mx-1 rounded-lg w-[calc(100%-8px)]'
                                    }`}
                                  >
                                    <span>Season {i + 1}</span>
                                    {season === i + 1 && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]" />}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <form onSubmit={handleJumpSubmit} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus-within:bg-white/10 focus-within:border-white/20 transition-all group">
                        <MagnifyingGlass size={14} className="text-zinc-400 group-focus-within:text-white transition-colors" />
                        <input
                          type="number"
                          placeholder="Ep #"
                          value={jumpToEp}
                          onChange={(e) => setJumpToEp(e.target.value)}
                          className="w-12 bg-transparent text-white placeholder-zinc-600 focus:outline-none text-sm font-medium text-center"
                        />
                        <div className="h-4 w-px bg-white/10" />
                        <button type="submit" className="text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50" disabled={jumping}>
                          {jumping ? <div className="w-3 h-3 border border-zinc-400 border-t-white rounded-full animate-spin"/> : 'GO'}
                        </button>
                      </form>
                    </div>
                  </div>

                  {episodesLoading && !jumping ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[1,2,3,4].map(i => (
                        <Skeleton key={i} className="rounded-xl h-40" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-24">
                      {episodes.map((ep) => (
                        <Link
                          key={`${season}-${ep.episodeNumber}-${ep.id}`}
                          href={`/watch/${id}?season=${season}&episode=${ep.episodeNumber}`}
                          ref={(el) => (episodeRefs.current[ep.episodeNumber] = el)}
                          className="block"
                        >
                          <motion.div
                            whileTap={{ scale: 0.98 }}
                            className="group relative rounded-xl overflow-hidden bg-zinc-900/50 border-2 border-white/10 hover:border-white/80 hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] cursor-pointer transition-all duration-300 scroll-mt-20 shadow-lg hover:shadow-2xl"
                          >
                          <div className="relative aspect-video w-full overflow-hidden bg-zinc-900">
                            {ep.primaryImage?.url ? (
                              <Image
                                src={ep.primaryImage.url}
                                loader={amazonImageLoader}
                                alt={ep.title}
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className="object-cover grayscale-[15%] group-hover:grayscale-0 transition-all duration-500 group-hover:scale-[1.03]"
                                loading="lazy"
                                placeholder="blur"
                                blurDataURL={BLUR_DATA_URL}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800/60 via-zinc-900 to-black relative overflow-hidden">
                                <div className="absolute inset-0 opacity-20">
                                  <div className="absolute bottom-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
                                </div>
                                <PlayCircle size={40} className="text-zinc-600 opacity-60 relative z-10" />
                              </div>
                            )}

                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center ring-1 ring-white/40 shadow-xl group-hover:scale-110 transition-transform">
                              <Play weight="fill" className="text-white w-5 h-5 ml-0.5" />
                            </div>
                          </div>

                          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/80 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/20">
                            <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Ep</span>
                            <span className="text-sm font-bold text-white">{ep.episodeNumber}</span>
                          </div>

                          {((ep.rating && (ep.rating.aggregateRating || typeof ep.rating === 'number')) || ep.averageRating) && (
                            <div className="absolute top-3 right-3 bg-black/80 px-2.5 py-1.5 rounded-lg border border-white/20 flex items-center gap-1.5 z-10">
                              <span className="text-xs font-bold text-white">
                                {getSafeRating(ep.rating) || getSafeRating(ep.averageRating)}
                              </span>
                              <Star size={12} weight="fill" className="text-yellow-400" />
                            </div>
                          )}
                          
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90" />
                          
                          <div className="absolute bottom-3 left-3 right-3 z-20 text-center">
                            <h4 className="text-white font-semibold text-xs drop-shadow-md line-clamp-2">
                              {ep.title}
                            </h4>
                          </div>
                          </div>
                          </motion.div>
                        </Link>
                      ))}

                      {nextPageToken && (
                        <div ref={(el) => {
                          if (el && !loadingMore && !jumping) {
                            const observer = new IntersectionObserver((entries) => {
                              if (entries[0].isIntersecting) {
                                fetchEpisodes(season, false);
                                observer.disconnect();
                              }
                            }, { threshold: 0.1 });
                            observer.observe(el);
                          }
                        }} />
                      )}
                      {loadingMore && (
                        <div className="col-span-full flex justify-center py-6">
                          <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin"></div>
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
