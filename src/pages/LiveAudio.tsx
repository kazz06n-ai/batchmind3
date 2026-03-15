import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

export default function LiveAudio() {
  const { profile } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ role: string, text: string }[]>([]);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Audio playback queue
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const connectLive = async () => {
    setIsConnecting(true);
    setError(null);
    setTranscript([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      } });
      mediaStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = audioCtx;

      // Setup recording
      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      // Use ScriptProcessorNode for simplicity in this demo (AudioWorklet is better for production)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are BatchMind AI, a helpful and friendly university study tutor. Keep your answers concise and conversational.",
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Convert Float32 to Int16 PCM
              const pcmData = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
              }
              
              // Convert to base64
              const buffer = new ArrayBuffer(pcmData.length * 2);
              const view = new DataView(buffer);
              for (let i = 0; i < pcmData.length; i++) {
                view.setInt16(i * 2, pcmData[i], true); // little endian
              }
              
              const base64Data = btoa(String.fromCharCode(...new Uint8Array(buffer)));
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({
                  media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                });
              });
            };

            source.connect(processor);
            processor.connect(audioCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              // Convert Int16 PCM to Float32
              const pcm16 = new Int16Array(bytes.buffer);
              const float32 = new Float32Array(pcm16.length);
              for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768.0;
              }
              
              audioQueueRef.current.push(float32);
              playNextAudioChunk();
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
            }

            // Handle Transcripts
            const modelTranscript = message.serverContent?.modelTurn?.parts[0]?.text;
            if (modelTranscript) {
              setTranscript(prev => [...prev, { role: 'assistant', text: modelTranscript }]);
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Connection error occurred.");
            disconnectLive();
          },
          onclose: () => {
            setIsConnected(false);
            disconnectLive();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err) {
      console.error("Failed to connect:", err);
      setError("Failed to start live audio session.");
      setIsConnecting(false);
      disconnectLive();
    }
  };

  const playNextAudioChunk = () => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0) return;
    
    const audioCtx = audioContextRef.current;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const chunk = audioQueueRef.current.shift()!;
    const audioBuffer = audioCtx.createBuffer(1, chunk.length, 24000);
    audioBuffer.getChannelData(0).set(chunk);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    const currentTime = audioCtx.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime;
    }

    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;

    source.onended = () => {
      if (audioQueueRef.current.length > 0) {
        playNextAudioChunk();
      }
    };
  };

  const disconnectLive = () => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {}
      sessionRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
  };

  useEffect(() => {
    return () => {
      disconnectLive();
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col text-white">
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 font-bold text-xl">
            <Volume2 className="text-purple-500" /> Live Audio Tutor
          </div>
        </div>
        {isConnected && (
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Connected
          </div>
        )}
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-4">Gemini 2.5 Native Audio</h1>
          <p className="text-zinc-400">Have a real-time voice conversation with your AI tutor. Ask questions, discuss topics, and learn interactively.</p>
        </div>

        <div className="relative flex items-center justify-center w-48 h-48 mb-12">
          {isConnected && (
            <>
              <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-4 rounded-full border-2 border-purple-500/40 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
            </>
          )}
          
          <button
            onClick={isConnected ? disconnectLive : connectLive}
            disabled={isConnecting}
            className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
              isConnected 
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' 
                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isConnecting ? (
              <Loader2 size={40} className="animate-spin" />
            ) : isConnected ? (
              <MicOff size={40} />
            ) : (
              <Mic size={40} />
            )}
          </button>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center w-full">
            {error}
          </div>
        )}

        {transcript.length > 0 && (
          <div className="w-full bg-zinc-800/50 rounded-2xl p-6 border border-zinc-700/50 h-64 overflow-y-auto flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider sticky top-0 bg-zinc-800/90 py-2 -mt-2">Live Transcript</h3>
            {transcript.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl p-3 text-sm ${t.role === 'user' ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-200'}`}>
                  {t.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
