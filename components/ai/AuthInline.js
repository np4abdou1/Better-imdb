'use client';

/**
 * GitHub Authentication Page
 * Full-page authentication flow with monochrome UI
 */

import { useState } from 'react';
import { Github, Loader, AlertCircle, Copy } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AuthInline({ onSuccess }) {
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

      // Auto-open GitHub in new tab
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

        if (!response.ok) {
          const data = await response.json();
          if (data.error?.includes('timeout') || data.error?.includes('no response')) {
            setError('Authorization timeout - please try again');
            setStep('error');
            return;
          }
          throw new Error(data.error || 'Authorization failed');
        }

        const data = await response.json();
        setUser(data.user);
        setStep('success');

        if (typeof window !== 'undefined') {
          localStorage.setItem('github_token', data.token);
        }

        setTimeout(() => {
          onSuccess?.(data.token);
        }, 1500);
      } catch (err) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000);
        } else {
          setError('Authorization timeout - please try again');
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

  function handleRetry() {
    setStep('idle');
    setUserCode('');
    setVerificationUri('');
    setDeviceCode('');
    setError('');
    setUser(null);
  }

  return (
    <div className="min-h-screen bg-[#181818] flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-2xl">
        {/* Idle: Show button */}
        {step === 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 text-center"
          >
            <div>
              <h1 className="text-5xl font-bold text-white mb-4">Authenticate</h1>
              <p className="text-gray-400 text-lg">
                Sign in with GitHub to get AI-powered movie recommendations
              </p>
            </div>

            <button
              onClick={startAuth}
              className="mx-auto flex items-center gap-3 bg-white text-black px-8 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              <Github size={20} />
              Continue with GitHub
            </button>

            <p className="text-gray-500 text-sm">
              You'll be asked to authorize this application on GitHub
            </p>
          </motion.div>
        )}

        {/* Loading: Show spinner */}
        {step === 'loading' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center gap-6"
          >
            <Loader size={48} className="text-gray-400 animate-spin" />
            <p className="text-gray-400 text-lg">Getting device code...</p>
          </motion.div>
        )}

        {/* Code: Show code and instructions */}
        {step === 'code' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Enter verification code</h2>
              <p className="text-gray-400">Copy your code and paste it on GitHub</p>
            </div>

            <div className="bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-500 mb-4">Your code</p>
              <code className="text-6xl font-mono font-bold text-gray-100 tracking-widest block mb-6">
                {userCode}
              </code>
              <button
                onClick={copyToClipboard}
                className="mx-auto flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded font-medium transition-colors"
              >
                <Copy size={16} />
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>

            <div className="space-y-4 bg-gray-900/50 border border-gray-800 rounded-lg p-6">
              <h3 className="font-semibold text-white">Next steps</h3>
              <ol className="space-y-3 text-gray-300 text-sm">
                <li className="flex gap-3">
                  <span className="font-bold text-gray-500 flex-shrink-0">1</span>
                  <span>A GitHub page should open in a new tab</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-gray-500 flex-shrink-0">2</span>
                  <span>Paste the code above</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-gray-500 flex-shrink-0">3</span>
                  <span>Authorize the application</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-gray-500 flex-shrink-0">4</span>
                  <span>We'll detect it automatically</span>
                </li>
              </ol>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <Loader size={16} className="animate-spin" />
                <span>Waiting for authorization...</span>
              </div>
              <button
                onClick={() => window.open(verificationUri, '_blank')}
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium py-2 rounded transition-colors"
              >
                Open GitHub (if page didn't open)
              </button>
            </div>
          </motion.div>
        )}

        {/* Success: Show confirmation */}
        {step === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8 text-center"
          >
            <div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6 }}
                className="text-7xl mb-6"
              >
                ✓
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">Success</h2>
              <p className="text-gray-400">
                Signed in as <span className="text-gray-200 font-medium">{user?.login}</span>
              </p>
            </div>

            {user?.avatar_url && (
              <motion.img
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                src={user.avatar_url}
                alt={user.login}
                className="w-20 h-20 rounded-full mx-auto border-2 border-gray-700"
              />
            )}

            <p className="text-gray-500 text-sm">Redirecting to chat...</p>
          </motion.div>
        )}

        {/* Error: Show error and retry */}
        {step === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 flex gap-4">
              <AlertCircle size={24} className="text-gray-400 flex-shrink-0 mt-1" />
              <div className="text-left">
                <h3 className="font-semibold text-white mb-1">Authentication failed</h3>
                <p className="text-gray-400 text-sm">{error}</p>
              </div>
            </div>

            <button
              onClick={handleRetry}
              className="w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Try again
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
