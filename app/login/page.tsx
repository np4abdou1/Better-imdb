'use client';

import { signIn } from "next-auth/react";
import { GithubLogo, Play } from '@phosphor-icons/react';
import { motion } from "framer-motion";

export default function LoginPage() {
  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-white/5 rounded-full blur-[120px] opacity-20 animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-zinc-800/20 rounded-full blur-[100px] opacity-30" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl shadow-2xl max-w-md w-full backdrop-blur-xl text-center"
      >
        <div className="mb-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg shadow-white/10">
            <Play fill="black" className="ml-1" size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome to Better IMDb</h1>
          <p className="text-zinc-400">Sign in to track your shows, create lists, and get AI recommendations.</p>
        </div>

        <button
          onClick={() => signIn("github", { callbackUrl: "/profile" })}
          className="w-full bg-white text-black font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors active:scale-95 duration-200"
        >
          <GithubLogo size={20} weight="bold" />
          <span>Continue with GitHub</span>
        </button>

        {/* Temporary Test Login Button */}
        <button
          onClick={() => signIn("test-login", { callbackUrl: "/ai" })}
          className="w-full mt-3 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-3 hover:bg-yellow-500/20 transition-colors active:scale-95 duration-200"
        >
          <Play size={20} weight="fill" />
          <span>Test Login (Dev Only)</span>
        </button>

        <p className="mt-6 text-xs text-zinc-600">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}
