'use client';

/**
 * Inline GitHub Authentication Component
 * Replaces initial message when token is not available
 * Monochrome UI - user-friendly device code flow
 */

import { useState, useEffect } from 'react';
import { Github, Loader, Check, AlertCircle, Copy } from 'lucide-react';
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
    const maxAttempts = 120; // 2 minutes (1 second intervals)

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

        // Store token in localStorage as fallback
        if (typeof window !== 'undefined') {
          localStorage.setItem('github_token', data.token);
        }

        // Trigger success callback
        setTimeout(() => {
          onSuccess?.(data.token);
        }, 1500);
      } catch (err) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000); // Retry after 1 second
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
    <div className="w-full h-full flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Idle: Show button */}
        {step === 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <p className="text-gray-400 text-center">
              Authenticate with GitHub to get AI-powered recommendations
            </p>
            <button
              onClick={startAuth}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded flex items-center justify-center gap-2 transition-all duration-200"
            >
              <Github size={20} />
              Authenticate with GitHub
            </button>
          </motion.div>
        )}

        {/* Loading: Show spinner */}
        {step === 'loading' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center gap-4"
          >
            <Loader size={40} className="text-gray-500 animate-spin" />
            <p className="text-gray-400 text-center">Getting device code...</p>
          </motion.div>
        )}

        {/* Code: Show code and instructions */}
        {step === 'code' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div>
              <p className="text-gray-400 text-center mb-4">
                Your verification code:
              </p>
              
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-4"
              >
                <code className="text-4xl font-mono font-bold text-gray-300 tracking-widest text-center block">
                  {userCode}
                </code>
              </motion.div>

              <button
                onClick={copyToClipboard}
                className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100 font-medium py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors mb-4"
              >
                <Copy size={16} />
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
              <p className="text-gray-300 font-semibold">Instructions:</p>
              <ol className="text-gray-400 text-sm space-y-2">
                <li className="flex gap-2">
                  <span className="text-gray-500 font-semibold flex-shrink-0">1.</span>
                  <span>A GitHub page should open in a new tab</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-500 font-semibold flex-shrink-0">2.</span>
                  <span>Paste the code above into GitHub</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-500 font-semibold flex-shrink-0">3.</span>
                  <span>Authorize the application</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-500 font-semibold flex-shrink-0">4.</span>
                  <span>We'll detect it automatically here</span>
                </li>
              </ol>
            </div>

            <div className="flex items-center justify-center gap-2 text-gray-500">
              <Loader size={16} className="animate-spin" />
              <span>Waiting for authorization...</span>
            </div>

            <button
              onClick={() => window.open(verificationUri, '_blank')}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded transition-colors"
            >
              Open GitHub (if not opened)
            </button>
          </motion.div>
        )}

        {/* Success: Show confirmation */}
        {step === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6 text-center"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6 }}
              className="text-5xl"
            >
              ✓
            </motion.div>

            <div>
              <p className="text-gray-300 font-semibold mb-2">Authentication successful!</p>
              <p className="text-gray-400">
                Signed in as <span className="text-gray-300 font-medium">{user?.login}</span>
              </p>
            </div>

            {user?.avatar_url && (
              <motion.img
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                src={user.avatar_url}
                alt={user.login}
                className="w-16 h-16 rounded-full mx-auto border border-gray-700"
              />
            )}

            <p className="text-gray-500 text-sm">Redirecting...</p>
          </motion.div>
        )}

        {/* Error: Show error and retry */}
        {step === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 flex gap-3">
              <AlertCircle size={20} className="text-gray-500 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-gray-300 font-semibold mb-1">Authentication failed</p>
                <p className="text-gray-400 text-sm">{error}</p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleRetry}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded transition-colors"
              >
                Try Again
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
