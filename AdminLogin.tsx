import React, { useState } from 'react';
import { Lock, Mail, Key, LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

interface AdminLoginProps {
  onAuthenticated: (token: string, user: any) => void;
}

export default function AdminLogin({ onAuthenticated }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Firebase client configuration is not configured. You can paste an existing ID Token below.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();
      onAuthenticated(token, userCredential.user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    onAuthenticated(manualToken.trim(), { email: 'token-auth@local', uid: 'custom-token' });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 p-4 antialiased">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 mb-6 shadow-inner">
          <Lock className="w-5 h-5" />
        </div>

        <h1 className="text-xl font-semibold text-white tracking-tight text-center mb-1">
          Administrator Access
        </h1>
        <p className="text-xs text-slate-400 text-center mb-6">
          Authenticate with an authorized administrative account to access security telemetry and audit controls.
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-950/40 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Admin Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@organization.local"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium transition flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            <span>Sign In to Dashboard</span>
          </button>
        </form>

        <div className="my-6 flex items-center gap-2 text-[11px] text-slate-500">
          <div className="flex-1 border-b border-slate-800" />
          <span>or authenticate with token</span>
          <div className="flex-1 border-b border-slate-800" />
        </div>

        {/* Direct Token Paste for developer validation & service accounts */}
        <form onSubmit={handleManualTokenSubmit} className="space-y-2">
          <label className="block text-[11px] font-medium text-slate-400">Firebase ID Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Paste Firebase ID token"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg transition cursor-pointer"
            >
              Verify
            </button>
          </div>
        </form>

        <p className="mt-6 text-[10px] text-slate-500 text-center">
          Administrative accounts are strictly validated against the server-side ADMIN_UIDS allowlist.
        </p>
      </div>
    </div>
  );
}
