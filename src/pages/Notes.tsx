import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firestore-utils';
import { BookOpen, Plus, Search, ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface Note {
  id: string;
  batch_id: string;
  created_by: string;
  title: string;
  content: string;
  subject: string;
  likes: number;
  dislikes: number;
  liked_by: string[];
  disliked_by: string[];
  created_at: string;
  updated_at: string;
}

export default function Notes() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSuperAdmin = profile?.role === 'super_admin' || user?.email === 'piyush19sn@gmail.com';

  useEffect(() => {
    if (!profile?.batch_id && !isSuperAdmin) return;
    
    let q;
    if (isSuperAdmin && !profile?.batch_id) {
      q = query(collection(db, 'notes'));
    } else {
      q = query(collection(db, 'notes'), where('batch_id', '==', profile?.batch_id));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes = snapshot.docs.map(doc => doc.data() as Note);
      setNotes(fetchedNotes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notes');
    });

    return () => unsubscribe();
  }, [profile, isSuperAdmin]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      let extractedText = '';
      
      if (file.name.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          extractedText += strings.join(' ') + '\n';
        }
      } else if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else {
        // Fallback for txt, md, csv, json
        extractedText = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.onerror = (error) => reject(error);
          reader.readAsText(file);
        });
      }

      if (extractedText) {
        setNewContent(prev => prev + (prev ? '\n\n' : '') + extractedText);
        if (!newTitle) setNewTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    } catch (error) {
      console.error("Error parsing file:", error);
      alert("Failed to parse the file. Please try another format.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !user) return;

    try {
      const noteId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newNote: Note = {
        id: noteId,
        batch_id: profile.batch_id || 'admin-batch',
        created_by: user.uid,
        title: newTitle,
        content: newContent,
        subject: newSubject,
        likes: 0,
        dislikes: 0,
        liked_by: [],
        disliked_by: [],
        created_at: now,
        updated_at: now
      };

      await setDoc(doc(db, 'notes', noteId), newNote);
      setIsCreating(false);
      setNewTitle('');
      setNewSubject('');
      setNewContent('');
      navigate(`/notes/${noteId}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notes');
    }
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(search.toLowerCase()) || 
    n.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-zinc-500 hover:text-zinc-900 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-xl">
            <BookOpen /> {isSuperAdmin ? 'All Notes (Admin)' : 'Batch Notes'}
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-6 mt-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input
              type="text"
              placeholder="Search notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
          >
            <Plus size={20} /> New Note
          </button>
        </div>

        {isCreating && (
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm mb-8">
            <h2 className="text-xl font-semibold text-zinc-900 mb-4">Create New Note</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    placeholder="e.g. Chapter 3: Cell Biology"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Subject</label>
                  <input
                    type="text"
                    required
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    placeholder="e.g. Biology 101"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-zinc-700">Content</label>
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 
                    {isUploading ? 'Extracting text...' : 'Upload PDF/DOCX/TXT'}
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept=".txt,.md,.csv,.json,.pdf,.docx" 
                    className="hidden" 
                  />
                </div>
                <textarea
                  required
                  rows={8}
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  className="w-full px-4 py-2 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono text-sm"
                  placeholder="Write your notes here or upload a file..."
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNotes.map(note => (
            <Link key={note.id} to={`/notes/${note.id}`} className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow flex flex-col h-48">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 bg-zinc-100 text-zinc-600 text-xs font-medium rounded-md uppercase tracking-wider">
                  {note.subject}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-2 line-clamp-2">{note.title}</h3>
              <p className="text-zinc-500 text-sm line-clamp-3 flex-grow">{note.content}</p>
              <div className="mt-4 text-xs text-zinc-400 flex items-center justify-between">
                <span>{format(new Date(note.created_at), 'MMM d, yyyy')}</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-600">
                    👍 {note.likes || 0}
                  </span>
                  <span className="flex items-center gap-1 text-red-500">
                    👎 {note.dislikes || 0}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {filteredNotes.length === 0 && !isCreating && (
            <div className="col-span-full py-12 text-center text-zinc-500">
              No notes found. Create one to get started!
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
