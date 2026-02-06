'use client';

/**
 * GitHub Device Authentication Modal
 * Browser-based authentication without requiring Personal Access Token
 */

import { useState, useEffect } from 'react';
import { X, Github, AlertCircle, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GithubUser {
  login: string;
  avatar_url: string;
}

interface GithubAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (token: string) => void;
}

type AuthStep = 'request' | 'waiting' | 'success' | 'error';

export default function GithubAuthModal({ isOpen, onClose, onSuccess }: GithubAuthModalProps) {
  const [step, setStep] = useState<AuthStep>('request'); // request, waiting, success, error
  const [userCode, setUserCode] = useState<string>('');
  const [verificationUri, setVerificationUri] = useState<string>('');
  const [deviceCode, setDeviceCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [user, setUser] = useState<GithubUser | null>(null);

  // Request device code on modal open
  useEffect(() => {
    if (isOpen && step === 'request') {
      requestDeviceCode();
    }
  }, [isOpen]);

  async function requestDeviceCode() {
    try {
      const response = await fetch('/api/auth/github-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-code' })
      });

      if (!response.ok) {
        throw new Error('Failed to get device code');
      }

      const data = await response.json();
      setDeviceCode(data.deviceCode);
      setUserCode(data.userCode);
      setVerificationUri(data.verificationUri);
      setStep('waiting');

      // Auto-open browser
      if (typeof window !== 'undefined') {
        window.open(data.verificationUri, '_blank');
      }

      // Start polling for token
      pollForToken(data.deviceCode);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setStep('error');
    }
  }

  async function pollForToken(code: string) {
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
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setStep('error');
    }
  }

  function handleRetry() {
    setStep('request');
    setUserCode('');
    setVerificationUri('');
    setError('');
    setUser(null);
    requestDeviceCode();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#282828] rounded-lg p-6 max-w-md w-full mx-4 border border-[#404040]"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Github size={24} />
                GitHub Authentication
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {step === 'request' && (
                <div className="space-y-2">
                  <p className="text-gray-400">Initializing authentication...</p>
                  <div className="flex justify-center">
                    <Loader className="animate-spin text-blue-400" size={24} />
                  </div>
                </div>
              )}

              {step === 'waiting' && (
                <div className="space-y-4">
                  <p className="text-gray-300">
                    Your authentication code is:
                  </p>
                  
                  <div className="bg-[#1f1f1f] border border-[#404040] rounded p-4">
                    <code className="text-2xl font-mono font-bold text-green-400 tracking-widest">
                      {userCode}
                    </code>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-sm text-blue-200 space-y-2">
                    <p className="font-semibold">📖 Instructions:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>We've opened GitHub in your browser</li>
                      <li>Paste the code above where prompted</li>
                      <li>Authorize the application</li>
                      <li>Come back here - we'll detect it automatically!</li>
                    </ol>
                  </div>

                  <button
                    onClick={() => window.open(verificationUri, '_blank')}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded transition-colors"
                  >
                    Open GitHub Authorization
                  </button>

                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <Loader size={16} className="animate-spin" />
                    <span>Waiting for authorization...</span>
                  </div>
                </div>
              )}

              {step === 'success' && (
                <div className="space-y-4 text-center">
                  <div className="flex justify-center">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 0.5 }}
                    >
                      <div className="text-5xl">✅</div>
                    </motion.div>
                  </div>

                  <div>
                    <p className="text-green-400 font-semibold mb-2">Authorization successful!</p>
                    <p className="text-gray-300">
                      Logged in as <span className="font-semibold text-white">{user?.login}</span>
                    </p>
                  </div>

                  {user?.avatar_url && (
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="w-16 h-16 rounded-full mx-auto"
                    />
                  )}

                  <p className="text-sm text-gray-400">
                    Redirecting to AI chat...
                  </p>
                </div>
              )}

              {step === 'error' && (
                <div className="space-y-4">
                  <div className="flex gap-3 items-start bg-red-500/10 border border-red-500/30 rounded p-3">
                    <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-400 font-semibold mb-1">Authentication failed</p>
                      <p className="text-red-300 text-sm">{error}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={handleRetry}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded transition-colors"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={onClose}
                      className="w-full bg-[#404040] hover:bg-[#505050] text-white font-semibold py-2 rounded transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <p className="text-xs text-gray-500 mt-4 text-center">
              Your GitHub token is secure and never stored publicly
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
