import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, setDoc, doc, onSnapshot, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firestore-utils';
import { ArrowLeft, Send, Bot, User as UserIcon, Loader2, Search } from 'lucide-react';
import Markdown from 'react-markdown';
import { GoogleGenAI } from '@google/genai';

interface ChatMessage {
  id: string;
  user_id: string;
  batch_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
}

export default function Chat() {
  const { profile, user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile?.batch_id) return;
    
    const q = query(
      collection(db, 'chat_messages'),
      where('batch_id', '==', profile.batch_id),
      orderBy('created_at', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => doc.data() as ChatMessage);
      setMessages(fetchedMessages);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chat_messages');
    });

    return () => unsubscribe();
  }, [profile]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !profile || !user) return;

    const userMessageContent = input;
    setInput('');
    setLoading(true);

    try {
      const messageId = crypto.randomUUID();
      const now = new Date().toISOString();
      
      // Save user message
      await setDoc(doc(db, 'chat_messages', messageId), {
        id: messageId,
        user_id: user.uid,
        batch_id: profile.batch_id,
        role: 'user',
        content: userMessageContent,
        created_at: now
      });

      // Fetch batch notes for context
      const notesQ = query(collection(db, 'notes'), where('batch_id', '==', profile.batch_id));
      const notesSnapshot = await getDocs(notesQ);
      const notes = notesSnapshot.docs.map(doc => doc.data() as Note);
      
      const notesContext = notes.map(n => `Title: ${n.title}\nContent: ${n.content}`).join('\n\n');

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const systemInstruction = `You are BatchMind AI, the study assistant for a university batch.
Your knowledge comes EXCLUSIVELY from the batch notes provided below AND Google Search for up-to-date information.
Rules:
- If the answer is not in the provided notes, say exactly: "This topic isn't covered in your batch notes yet. Consider adding it!"
- Always cite the source note title at the end of your answer if using notes.
- Keep answers concise, clear, and student-friendly.
- Use bullet points for multi-part answers.
- Never fabricate facts, formulas, or definitions.

BATCH NOTES CONTEXT:
${notesContext}`;

      // Format history for Gemini
      const history = messages.slice(-6).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const chatSession = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        }
      });

      // Send history if any
      if (history.length > 0) {
        // The SDK doesn't directly support passing history to chats.create in the same way as old SDK, 
        // but we can just send a single generateContent request with the history.
      }
      
      // Let's use generateContent directly to pass history easily
      const contents = [
        ...history,
        { role: 'user', parts: [{ text: userMessageContent }] }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }]
        }
      });

      const assistantMessageId = crypto.randomUUID();
      
      let responseText = response.text;
      
      // Extract grounding chunks if available
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks && chunks.length > 0) {
        responseText += '\n\n**Sources:**\n';
        chunks.forEach(chunk => {
          if (chunk.web?.uri && chunk.web?.title) {
            responseText += `- [${chunk.web.title}](${chunk.web.uri})\n`;
          }
        });
      }

      await setDoc(doc(db, 'chat_messages', assistantMessageId), {
        id: assistantMessageId,
        user_id: user.uid,
        batch_id: profile.batch_id,
        role: 'assistant',
        content: responseText,
        created_at: new Date().toISOString()
      });

    } catch (error) {
      console.error("Chat error:", error);
      alert("Failed to send message.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <nav className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <Link to="/" className="text-zinc-500 hover:text-zinc-900 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2 text-emerald-600 font-bold text-xl">
          <Bot /> Batch AI Chat
        </div>
      </nav>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 overflow-y-auto flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
            <Bot size={48} className="mb-4 text-zinc-300" />
            <p className="text-lg font-medium text-zinc-900 mb-2">How can I help you study?</p>
            <p className="text-sm text-center max-w-md">I can answer questions based on your batch's notes, or search the web for the latest information.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <Bot size={16} />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-zinc-900 text-white rounded-br-none' : 'bg-white border border-zinc-200 shadow-sm rounded-bl-none text-zinc-800'}`}>
              <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-800 prose-pre:text-zinc-100">
                <Markdown>{msg.content}</Markdown>
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center flex-shrink-0">
                <UserIcon size={16} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-4 justify-start">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <Bot size={16} />
            </div>
            <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl rounded-bl-none p-4 flex items-center gap-2 text-zinc-500">
              <Loader2 className="animate-spin" size={16} /> Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <div className="bg-white border-t border-zinc-200 p-4 sticky bottom-0 z-10">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask a question about your notes..."
            className="w-full pl-4 pr-12 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2 p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </form>
        <div className="text-center mt-2 text-xs text-zinc-400 flex items-center justify-center gap-1">
          <Search size={12} /> Powered by Gemini 3 Flash & Google Search
        </div>
      </div>
    </div>
  );
}
