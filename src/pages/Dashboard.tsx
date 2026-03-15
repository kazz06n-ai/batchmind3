import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, MessageSquare, Mic, LogOut, ShieldAlert, Shield } from 'lucide-react';
import { logOut } from '../firebase';

export default function Dashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const isSuperAdmin = profile?.role === 'super_admin' || user?.email === 'piyush19sn@gmail.com';
  const isBatchAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (profile && !profile.batch_id && !isSuperAdmin) {
      navigate('/batch');
    }
  }, [profile, isSuperAdmin, navigate]);

  if (!profile) return null;
  if (!profile.batch_id && !isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-600 font-bold text-xl">
          <BookOpen /> BatchMind AI
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-zinc-600">
            {profile.name} {isSuperAdmin ? '(Super Admin)' : isBatchAdmin ? '(Batch Admin)' : ''}
          </span>
          <button onClick={() => logOut()} className="p-2 text-zinc-400 hover:text-zinc-900 rounded-full hover:bg-zinc-100 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-6 mt-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">
          {isSuperAdmin ? 'Welcome to BatchMind Admin' : 'Welcome to your Batch'}
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(isSuperAdmin || isBatchAdmin) && (
            <Link to="/admin" className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow group md:col-span-3 bg-gradient-to-r from-zinc-900 to-zinc-800 text-white">
              <div className="w-12 h-12 bg-white/10 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                {isSuperAdmin ? <ShieldAlert size={24} /> : <Shield size={24} />}
              </div>
              <h2 className="text-xl font-semibold mb-2">{isSuperAdmin ? 'Super Admin Panel' : 'Batch Admin Panel'}</h2>
              <p className="text-zinc-300 text-sm">
                {isSuperAdmin 
                  ? 'Observe all batches, modify details, and manage the platform.' 
                  : 'Manage your batch details and assign admin roles to other members.'}
              </p>
            </Link>
          )}

          <Link to="/notes" className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow group">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BookOpen size={24} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 mb-2">Batch Notes</h2>
            <p className="text-zinc-500 text-sm">Access and contribute to your batch's shared knowledge base.</p>
          </Link>

          <Link to="/chat" className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow group">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <MessageSquare size={24} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 mb-2">AI Chatbot</h2>
            <p className="text-zinc-500 text-sm">Ask questions grounded in your batch notes and web search.</p>
          </Link>

          <Link to="/live" className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow group">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Mic size={24} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 mb-2">Live Audio Tutor</h2>
            <p className="text-zinc-500 text-sm">Have a real-time voice conversation with Gemini 2.5 Native Audio.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
