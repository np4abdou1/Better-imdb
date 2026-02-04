'use client';

import { useState, useEffect } from 'react';
import { Github, Loader, AlertCircle, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AuthPrompt({ onSuccess }) {
  const [step, setStep] = useState('idle'); // idle, loading, code, success, error
  const [userCode, setUserCode] = useState('');
  const [verificationUri, setVerificationUri] = useState('');
  const [deviceCode, setDeviceCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState(null);

  async function startAuth() {
    setStep('loading');
    setError('');

    try {
      const response = await fetch('/api/auth/github-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-code' })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get device code');
      }

      const data = await response.json();
      setDeviceCode(data.deviceCode);
      setUserCode(data.userCode);
      setVerificationUri(data.verificationUri);
      setStep('code');

      // Open GitHub in new tab
      window.open(data.verificationUri, '_blank');

      // Start polling for token
      pollForToken(data.deviceCode);
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }

  async function pollForToken(code) {
    let attempts = 0;
    const maxAttempts = 120;
    let pollInterval = 5000;

    const poll = async () => {
      try {
        const response = await fetch('/api/auth/github-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'poll-token',
            deviceCode: code
          })
        });

        const data = await response.json();

        if (!response.ok) {
          // If it's a real failure (not pending), show error
          if (!data.pending) {
            throw new Error(data.error || 'Authorization failed');
          }
        }
        
        // If still pending or slow_down, continue polling
        if (data.pending) {
          attempts++;
          if (data.status === 'slow_down') {
            pollInterval += 5000; // Increase backoff
          }
          
          if (attempts < maxAttempts) {
            setTimeout(poll, pollInterval);
          } else {
            setError('Authorization timeout');
            setStep('error');
          }
          return;
        }

        // Success!
        if (data.success && data.token) {
          setUser(data.user);
          setStep('success');

          if (typeof window !== 'undefined') {
            localStorage.setItem('github_token', data.token);
          }

          setTimeout(() => {
            onSuccess?.(data.token);
          }, 1500);
          return;
        }
        
        throw new Error('Invalid response from server');
      } catch (err) {
        // For network errors or unexpected errors, retry a few times
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          setError(err.message);
          setStep('error');
        }
      }
    };

    poll();
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-6 border border-white/10 rounded-2xl bg-white/5 p-6 max-w-md">
      {step === 'idle' && (
        <button
          onClick={startAuth}
          className="w-full flex items-center justify-center gap-2 bg-white text-black py-3 rounded-xl font-bold hover:bg-zinc-200 transition-all uppercase tracking-tight text-sm"
        >
          <Github size={18} />
          Authorize GitHub
        </button>
      )}

      {step === 'loading' && (
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader size={18} className="animate-spin" />
          <span className="text-sm">Initiating device flow...</span>
        </div>
      )}

      {step === 'code' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500 uppercase font-bold tracking-widest">Verification Code</span>
            <div className="flex items-center justify-between bg-black/40 border border-white/10 rounded-lg p-4">
              <code className="text-2xl font-mono font-bold tracking-widest text-white">
                {userCode}
              </code>
              <button 
                onClick={copyToClipboard}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400"
              >
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              1. Open <a href={verificationUri} target="_blank" className="text-white underline">GitHub</a><br/>
              2. Paste the code above<br/>
              3. We'll refresh once authorized
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-500 italic">
               <Loader size={12} className="animate-spin" />
               Waiting for authorization...
            </div>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="flex items-center gap-4 text-white">
          <div className="w-10 h-10 rounded-full border border-green-500/50 flex items-center justify-center bg-green-500/10 text-green-500">
            <Check size={20} />
          </div>
          <div>
            <p className="font-bold text-sm">Authenticated!</p>
            <p className="text-xs text-zinc-400">Welcome, {user?.login}</p>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-red-400">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">{error}</p>
          </div>
          <button
            onClick={() => setStep('idle')}
            className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-all"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
