'use client';
import { useState, useEffect, use, useRef } from 'react';
import { getTitleDetails, getTitleEpisodes, saveRating, getRating, getLists, addListItem, getTitleCredits, getTitleImages, getTitleAwards, getTitleBoxOffice, getTitleLogo } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Clock, Calendar, ArrowLeft, Play, Plus, Check, MagnifyingGlass, CaretDown, Monitor, FilmReel, UserCircle, Trophy, CurrencyDollar } from '@phosphor-icons/react';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import clsx from 'clsx';
import { BLUR_DATA_URL } from '@/lib/api-config';
import { amazonImageLoader } from '@/lib/amazon-image-loader';

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

  const episodeRefs = useRef({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch critical data first
        const titleData = await getTitleDetails(id);
        setTitle(titleData);

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
    <div className="min-h-screen py-12">
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
      <div className="fixed inset-0 z-[-1]" style={{ backgroundColor: '#181818' }}>
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-white/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-zinc-900/40 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-[77rem] mx-auto pt-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:sticky lg:top-12 inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group text-base font-medium mb-8 z-20 relative"
        >
          <Link href="/" className="inline-flex items-center gap-2">
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span>Back</span>
          </Link>
        </motion.div>

        <div className="flex gap-12 items-start">
          <div className="lg:sticky lg:top-24 self-start h-fit mb-6 lg:mb-0 lg:w-[320px] flex-shrink-0">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              whileHover={{ y: -5 }}
              className="cursor-pointer"
            >
              <div className="rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-zinc-900 aspect-[2/3] relative group" style={{ maxWidth: '320px' }}>
                {title.primaryImage?.url ? (
                  <Image
                    src={title.primaryImage.url}
                    loader={amazonImageLoader}
                    alt={title.primaryTitle}
                    fill
                    priority
                    sizes="320px"
                    className="object-cover grayscale-[15%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
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
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 group-hover:ring-white/30 transition-colors" />
              </div>
            </motion.div>
          </div>

          <div className="flex-1 min-w-0">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
              className="flex flex-col gap-12 pt-2"
            >

              <div className="space-y-6">
                <div className="space-y-3">
                  {logo ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.6 }}
                      className="relative w-full max-w-2xl h-24 md:h-32 lg:h-40"
                    >
                      <Image
                        src={logo}
                        loader={amazonImageLoader}
                        alt={title.primaryTitle}
                        fill
                        priority
                        sizes="(max-width: 768px) 100vw, 80vw"
                        className="object-contain object-left"
                        placeholder="blur"
                        blurDataURL={BLUR_DATA_URL}
                      />
                    </motion.div>
                  ) : (
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
                      {title.primaryTitle}
                    </h1>
                  )}

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

                <motion.p 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.35 }}
                  className="text-sm md:text-base text-zinc-300 leading-relaxed"
                >
                  {title.plot || "No plot synopsis available for this title."}
                </motion.p>

                <div className="flex gap-1.5 flex-wrap pt-2">
                  {title.genres?.map((genre, idx) => (
                    <motion.span 
                      key={genre} 
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.15 + idx * 0.05, duration: 0.3 }}
                      whileHover={{ scale: 1.1, borderColor: 'rgba(255, 255, 255, 0.6)' }}
                      className="px-3 py-1 rounded-full border border-white/15 text-zinc-400 text-xs hover:border-white/40 hover:bg-white/5 transition-all cursor-default"
                    >
                      {genre}
                    </motion.span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 border-b border-white/5 pb-6">
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
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
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
                    </motion.button>
                  ))}
                </div>

                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2 justify-between">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Your Rating</label>
                    {userRating > 0 && (
                      <motion.span 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-lg font-bold text-white bg-white/10 px-3 py-1 rounded-lg"
                      >
                        {userRating.toFixed(1)}/10
                      </motion.span>
                    )}
                  </div>
                  <input
                    type="range" min="0" max="10" step="0.1"
                    value={userRating || 0} onChange={handleRate}
                    className="w-full h-2 bg-zinc-800 rounded appearance-none cursor-pointer accent-white transition-all hover:h-2.5"
                  />
                </motion.div>
              </div>

              {(awards.length > 0 || boxOffice) && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="grid grid-cols-2 gap-4 pt-4 pb-2"
                >
                  {awards.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.45, duration: 0.4 }}
                      whileHover={{ scale: 1.03, borderColor: 'rgba(255, 255, 255, 0.3)' }}
                      className="bg-white/5 hover:bg-white/8 rounded-xl p-4 border border-white/10 transition-all duration-300 group cursor-default"
                    >
                      <div className="flex items-center gap-2 mb-2 text-yellow-400 group-hover:text-yellow-300 transition-colors">
                        <Trophy size={18} />
                        <span className="font-bold text-white">Awards</span>
                      </div>
                      <p className="text-sm text-zinc-300 group-hover:text-zinc-200 transition-colors">
                        {awards.filter(a => a.isWinner).length > 0 ?
                          `${awards.filter(a => a.isWinner).length} Wins & ${awards.length} Nominations` :
                          `${awards.length} Nominations`}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-1">
                        {awards.slice(0, 3).map(a => a.event?.name).filter(Boolean).join(', ')}
                      </p>
                    </motion.div>
                  )}

                  {boxOffice && boxOffice.worldwideGross && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      whileHover={{ scale: 1.03, borderColor: 'rgba(255, 255, 255, 0.3)' }}
                      className="bg-white/5 hover:bg-white/8 rounded-xl p-4 border border-white/10 transition-all duration-300 group cursor-default"
                    >
                      <div className="flex items-center gap-2 mb-2 text-green-400 group-hover:text-green-300 transition-colors">
                        <CurrencyDollar size={18} />
                        <span className="font-bold text-white">Box Office</span>
                      </div>
                      <p className="text-sm text-zinc-300 group-hover:text-zinc-200 transition-colors font-semibold">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(boxOffice.worldwideGross.amount)}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">Worldwide Gross</p>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {showCredits && credits.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.25 }}
                  className="pt-4 border-t border-white/5"
                >
                  <motion.h2 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="text-2xl font-bold text-white tracking-tight mb-6 flex items-center gap-2"
                  >
                    Cast & Crew
                  </motion.h2>

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
                  )}
                </motion.div>
              )}

              {showImages && images.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="pt-4 border-t border-white/5"
                >
                  <motion.h2 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.45 }}
                    className="text-2xl font-bold text-white tracking-tight mb-6"
                  >
                    Images
                  </motion.h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-6">
                    {images.slice(0, 9).map((image, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.85, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.5 }}
                        whileHover={{ scale: 1.05, y: -8 }}
                        className="group relative aspect-[16/9] rounded-xl overflow-hidden bg-zinc-900/50 border border-white/10 hover:border-white/30 transition-all cursor-pointer"
                        onClick={() => {
                          setSelectedImage(image);
                          setImageModalOpen(true);
                        }}
                        onMouseEnter={() => setSelectedImage(image)}
                      >
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
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
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
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                    >
                      <h2 className="text-2xl font-bold text-white tracking-tight">Episodes</h2>
                      <p className="text-xs text-zinc-500 mt-1">Season {season}</p>
                    </motion.div>

                    <div className="flex flex-wrap items-center gap-3">
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

                      <form onSubmit={handleJumpSubmit} className="flex items-center gap-1 bg-white/5 rounded-lg border border-white/10 px-2">
                        <input
                          type="number"
                          placeholder="Ep"
                          value={jumpToEp}
                          onChange={(e) => setJumpToEp(e.target.value)}
                          className="w-12 bg-transparent px-1 py-1.5 text-white placeholder-zinc-600 focus:outline-none text-center font-mono text-sm transition-colors"
                        />
                        <button type="submit" className="p-1.5 rounded hover:bg-white/20 transition-colors" disabled={jumping}>
                          {jumping ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"/> : <MagnifyingGlass size={14} />}
                        </button>
                      </form>
                    </div>
                  </div>

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
                          initial={{ opacity: 0, y: 15, x: -10 }}
                          whileInView={{ opacity: 1, y: 0, x: 0 }}
                          viewport={{ once: true, margin: "-50px" }}
                          transition={{ delay: i * 0.05, duration: 0.5 }}
                          whileHover={{ y: -5, scale: 1.02 }}
                          className="group relative rounded-xl overflow-hidden bg-black/40 backdrop-blur-sm border border-white/10 hover:border-white/30 transition-all duration-300 scroll-mt-20"
                        >
                          <div className="relative aspect-video w-full overflow-hidden bg-zinc-900">
                            {ep.primaryImage?.url ? (
                              <Image
                                src={ep.primaryImage.url}
                                loader={amazonImageLoader}
                                alt={ep.title}
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className="object-cover grayscale-[15%] group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
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
                            <div className="absolute top-3 left-3 z-10 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/15 hover:border-white/30 transition-colors">
                              <span className="text-xs font-bold text-white/80">EP {ep.episodeNumber}</span>
                            </div>
                            {ep.rating && (
                              <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-white/20 flex items-center gap-1.5">
                                <Star size={12} className="fill-white text-white" />
                                <span className="text-xs font-bold text-white">{ep.rating.aggregateRating}</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          </div>

                          <div className="p-4 space-y-3">
                            <motion.h4 
                              initial={{ opacity: 0, y: 5 }}
                              whileInView={{ opacity: 1, y: 0 }}
                              viewport={{ once: true }}
                              transition={{ delay: i * 0.05 + 0.1 }}
                              className="font-bold text-white text-base group-hover:text-zinc-100 transition-colors line-clamp-2"
                            >
                              {ep.title}
                            </motion.h4>

                            {ep.plot && (
                              <motion.p 
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 + 0.15 }}
                                className="text-zinc-400 text-xs line-clamp-2 leading-relaxed"
                              >
                                {ep.plot}
                              </motion.p>
                            )}

                            {ep.releaseDate && (
                              <motion.div 
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 + 0.2 }}
                                className="flex items-center gap-2 text-xs text-zinc-500 pt-1"
                              >
                                <Calendar size={12} />
                                <span>
                                  {typeof ep.releaseDate === 'object' && ep.releaseDate !== null ?
                                    new Date(ep.releaseDate.year, ep.releaseDate.month - 1, ep.releaseDate.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                    : ep.releaseDate}
                                </span>
                              </motion.div>
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
