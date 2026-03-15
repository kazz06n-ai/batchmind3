import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firestore-utils';
import { ArrowLeft, Sparkles, Loader2, Trash2, ThumbsUp, ThumbsDown } from 'lucide-react';
import Markdown from 'react-markdown';
import { GoogleGenAI } from '@google/genai';

interface Note {
  id: string;
  batch_id: string;
  created_by: string;
  title: string;
  content: string;
  subject: string;
  ai_summary?: string;
  likes: number;
  dislikes: number;
  liked_by: string[];
  disliked_by: string[];
  created_at: string;
  updated_at: string;
}

export default function NoteDetail() {
  const { noteId } = useParams<{ noteId: string }>();
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin' || user?.email === 'piyush19sn@gmail.com';
  const isBatchAdmin = profile?.role === 'admin' && profile?.batch_id === note?.batch_id;

  useEffect(() => {
    if (!noteId || !profile) return;
    const unsubscribe = onSnapshot(doc(db, 'notes', noteId), (docSnap) => {
      if (docSnap.exists()) {
        setNote(docSnap.data() as Note);
      } else {
        navigate('/notes');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `notes/${noteId}`);
    });
    return () => unsubscribe();
  }, [noteId, profile, navigate]);

  const generateSummary = async () => {
    if (!note || !noteId) return;
    setLoadingSummary(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `You are an expert academic summarizer.
Summarize the following student notes and return ONLY valid JSON.
No markdown fences. No preamble. Pure JSON.

Schema:
{
 "summary": "string — 2-3 sentence overview",
 "key_points": ["string"],
 "key_terms": [{"term": "string", "definition": "string"}],
 "missing_topics": ["string — topic that seems absent or incomplete"]
}

NOTES:
${note.content}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const summaryJson = response.text;
      
      await updateDoc(doc(db, 'notes', noteId), {
        ai_summary: summaryJson,
        updated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error generating summary:", error);
      alert("Failed to generate summary.");
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleDelete = async () => {
    if (!noteId || !window.confirm('Are you sure you want to delete this note?')) return;
    try {
      await deleteDoc(doc(db, 'notes', noteId));
      navigate('/notes');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notes/${noteId}`);
    }
  };

  const handleLike = async () => {
    if (!note || !noteId || !user) return;
    const uid = user.uid;
    const likedBy = note.liked_by || [];
    const dislikedBy = note.disliked_by || [];
    
    let newLikedBy = [...likedBy];
    let newDislikedBy = [...dislikedBy];
    
    if (likedBy.includes(uid)) {
      // Remove like
      newLikedBy = newLikedBy.filter(id => id !== uid);
    } else {
      // Add like
      newLikedBy.push(uid);
      // Remove dislike if exists
      newDislikedBy = newDislikedBy.filter(id => id !== uid);
    }
    
    try {
      await updateDoc(doc(db, 'notes', noteId), {
        liked_by: newLikedBy,
        disliked_by: newDislikedBy,
        likes: newLikedBy.length,
        dislikes: newDislikedBy.length
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notes/${noteId}`);
    }
  };

  const handleDislike = async () => {
    if (!note || !noteId || !user) return;
    const uid = user.uid;
    const likedBy = note.liked_by || [];
    const dislikedBy = note.disliked_by || [];
    
    let newLikedBy = [...likedBy];
    let newDislikedBy = [...dislikedBy];
    
    if (dislikedBy.includes(uid)) {
      // Remove dislike
      newDislikedBy = newDislikedBy.filter(id => id !== uid);
    } else {
      // Add dislike
      newDislikedBy.push(uid);
      // Remove like if exists
      newLikedBy = newLikedBy.filter(id => id !== uid);
    }
    
    try {
      await updateDoc(doc(db, 'notes', noteId), {
        liked_by: newLikedBy,
        disliked_by: newDislikedBy,
        likes: newLikedBy.length,
        dislikes: newDislikedBy.length
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notes/${noteId}`);
    }
  };

  if (!note) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  let summaryData = null;
  if (note.ai_summary) {
    try {
      summaryData = JSON.parse(note.ai_summary);
    } catch (e) {
      console.error("Failed to parse summary JSON", e);
    }
  }

  const hasLiked = user && (note.liked_by || []).includes(user.uid);
  const hasDisliked = user && (note.disliked_by || []).includes(user.uid);
  const canDelete = isSuperAdmin || isBatchAdmin || (user && note.created_by === user.uid);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row">
      <div className="flex-1 overflow-y-auto">
        <nav className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <Link to="/notes" className="text-zinc-500 hover:text-zinc-900 transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div className="font-medium text-zinc-900 truncate">{note.title}</div>
          </div>
          {canDelete && (
            <button 
              onClick={handleDelete}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Trash2 size={16} /> Delete Note
            </button>
          )}
        </nav>

        <main className="max-w-3xl mx-auto p-6 md:p-12">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 bg-zinc-100 text-zinc-600 text-sm font-medium rounded-md uppercase tracking-wider inline-block">
                {note.subject}
              </span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleLike}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${hasLiked ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                >
                  <ThumbsUp size={16} className={hasLiked ? 'fill-emerald-700' : ''} />
                  {note.likes || 0}
                </button>
                <button 
                  onClick={handleDislike}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${hasDisliked ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                >
                  <ThumbsDown size={16} className={hasDisliked ? 'fill-red-700' : ''} />
                  {note.dislikes || 0}
                </button>
              </div>
            </div>
            <h1 className="text-4xl font-bold text-zinc-900 mb-4">{note.title}</h1>
          </div>
          
          <div className="prose prose-zinc max-w-none">
            <Markdown>{note.content}</Markdown>
          </div>
        </main>
      </div>

      {/* AI Summary Sidebar */}
      <div className="w-full md:w-96 bg-white border-l border-zinc-200 overflow-y-auto flex flex-col">
        <div className="p-6 border-b border-zinc-200 bg-zinc-50/50 sticky top-0 z-10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
            <Sparkles className="text-emerald-500" size={20} /> AI Summary
          </h2>
          {!summaryData && (
            <button
              onClick={generateSummary}
              disabled={loadingSummary}
              className="px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {loadingSummary ? <Loader2 className="animate-spin" size={16} /> : 'Generate'}
            </button>
          )}
        </div>

        <div className="p-6">
          {summaryData ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-2">Overview</h3>
                <p className="text-zinc-600 text-sm leading-relaxed">{summaryData.summary}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-2">Key Points</h3>
                <ul className="list-disc pl-4 space-y-1 text-sm text-zinc-600">
                  {summaryData.key_points?.map((point: string, i: number) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-2">Key Terms</h3>
                <div className="space-y-3">
                  {summaryData.key_terms?.map((term: any, i: number) => (
                    <div key={i} className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                      <div className="font-semibold text-zinc-900 text-sm mb-1">{term.term}</div>
                      <div className="text-zinc-600 text-xs">{term.definition}</div>
                    </div>
                  ))}
                </div>
              </div>

              {summaryData.missing_topics?.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wider mb-2">Missing Topics</h3>
                  <ul className="list-disc pl-4 space-y-1 text-sm text-amber-600">
                    {summaryData.missing_topics.map((topic: string, i: number) => (
                      <li key={i}>{topic}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <button
                onClick={generateSummary}
                disabled={loadingSummary}
                className="w-full py-2 mt-4 text-sm text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loadingSummary ? <Loader2 className="animate-spin" size={16} /> : 'Regenerate Summary'}
              </button>
            </div>
          ) : (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No summary generated yet. Click generate to get an AI overview of these notes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
