'use client';
import ChatInterface from '@/components/ai/ChatInterface';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AIHomeContent() {
  const searchParams = useSearchParams();
  const key = searchParams.get('t'); // Force remount on new chat

  return (
    <ChatInterface key={key} />
  );
}

export default function AIHomePage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-[#181818]" />}>
      <AIHomeContent />
    </Suspense>
  );
}

