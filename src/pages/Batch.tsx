import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firestore-utils';

export default function Batch() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteParam = searchParams.get('invite');
  
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [inviteCode, setInviteCode] = useState(inviteParam || '');
  const [batchName, setBatchName] = useState('');
  const [university, setUniversity] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (inviteParam) {
      setMode('join');
      setInviteCode(inviteParam);
    }
  }, [inviteParam]);

  const generateInviteCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setLoading(true);
    setError('');

    try {
      const batchId = crypto.randomUUID();
      const code = generateInviteCode();
      
      await setDoc(doc(db, 'batches', batchId), {
        id: batchId,
        name: batchName,
        university,
        year: new Date().getFullYear(),
        department,
        invite_code: code,
        created_by: user.uid,
        created_at: new Date().toISOString()
      });

      await updateDoc(doc(db, 'users', user.uid), {
        batch_id: batchId,
        role: 'admin'
      });

      navigate('/');
    } catch (err) {
      setError('Failed to create batch');
      handleFirestoreError(err, OperationType.CREATE, 'batches');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setLoading(true);
    setError('');

    try {
      const q = query(collection(db, 'batches'), where('invite_code', '==', inviteCode.toUpperCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setError('Invalid invite code');
        setLoading(false);
        return;
      }

      const batchDoc = querySnapshot.docs[0];
      
      await updateDoc(doc(db, 'users', user.uid), {
        batch_id: batchDoc.id,
        role: 'student'
      });

      navigate('/');
    } catch (err) {
      setError('Failed to join batch');
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
        <h1 className="text-2xl font-bold text-zinc-900 mb-6 text-center">
          {mode === 'join' ? 'Join a Batch' : 'Create a Batch'}
        </h1>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

        {mode === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Invite Code</label>
              <input
                type="text"
                required
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none uppercase"
                placeholder="e.g. A1B2C3"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Join Batch'}
            </button>
            <p className="text-center text-sm text-zinc-500 mt-4">
              Don't have a code? <button type="button" onClick={() => setMode('create')} className="text-emerald-600 font-medium hover:underline">Create a new batch</button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Batch Name</label>
              <input
                type="text"
                required
                value={batchName}
                onChange={e => setBatchName(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="e.g. CS 2024 Section A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">University</label>
              <input
                type="text"
                required
                value={university}
                onChange={e => setUniversity(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="e.g. Stanford University"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Department</label>
              <input
                type="text"
                required
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="e.g. Computer Science"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Batch'}
            </button>
            <p className="text-center text-sm text-zinc-500 mt-4">
              Have an invite code? <button type="button" onClick={() => setMode('join')} className="text-emerald-600 font-medium hover:underline">Join an existing batch</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
