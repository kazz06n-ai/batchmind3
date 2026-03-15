import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithGoogle, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firestore-utils';
import { BookOpen } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  const from = location.state?.from ? `${location.state.from.pathname}${location.state.from.search || ''}` : '/';

  const handleLogin = async () => {
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      
      // Check if user profile exists
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        const isSuperAdmin = user.email === 'piyush19sn@gmail.com';
        // Create new user profile
        await setDoc(docRef, {
          id: user.uid,
          email: user.email || '',
          name: user.displayName || 'Student',
          university: '',
          department: '',
          batch_id: '',
          role: isSuperAdmin ? 'super_admin' : 'student',
          avatar_url: user.photoURL || '',
          created_at: new Date().toISOString()
        });
      } else {
        // If they are the bootstrap admin but their role isn't super_admin yet, upgrade them
        const data = docSnap.data();
        if (user.email === 'piyush19sn@gmail.com' && data.role !== 'super_admin') {
          await setDoc(docRef, { ...data, role: 'super_admin' }, { merge: true });
        }
      }
      
      navigate(from, { replace: true });
    } catch (error) {
      console.error(error);
      // Let ErrorBoundary catch it if we want, or handle locally
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <BookOpen size={32} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">BatchMind AI</h1>
        <p className="text-zinc-500 mb-8">Collaborative academic intelligence for your university batch.</p>
        
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 px-4 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>
      </div>
    </div>
  );
}
