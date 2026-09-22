import React, { useState, useEffect } from 'react';
import { Lightbulb, Loader2, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { StoryMood } from '../types/legacy';

interface StoryboardTipsProps {
  mood: StoryMood;
}

export function StoryboardTips({ mood }: StoryboardTipsProps) {
  const [tips, setTips] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchTips = async () => {
      setIsLoading(true);
      setTips([]);
      try {
        const response = await fetch('/api/storyboard-tips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mood }),
        });
        if (!response.ok) throw new Error('Failed to fetch tips');
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (isMounted) {
          setTips(data.tips || [
            "Stosuj płytką głębię ostrości (np. f/1.4 - f/2.8), aby odciąć Parę Młodą od tła i nadać ujęciom kinowej miękkości.",
            "Wykorzystaj 'golden hour' na kręcenie portretów plenerowych, by uzyskać naturalne, miękkie i ciepłe światło z flarami."
          ]);
        }
      } catch (err) {
        console.warn('Tips fallback active:', err);
        if (isMounted) {
          setTips([
            "Stosuj płytką głębię ostrości (np. f/1.4 - f/2.8), aby odciąć Parę Młodą od tła i nadać ujęciom kinowej miękkości.",
            "Wykorzystaj 'golden hour' na kręcenie portretów plenerowych, by uzyskać naturalne, miękkie i ciepłe światło z flarami."
          ]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchTips();
    return () => { isMounted = false; };
  }, [mood]);

  if (!isLoading && tips.length === 0) return null;

  return (
    <div className="mb-6 glass-panel rounded-2xl p-5 shadow-lg print:hidden relative overflow-hidden">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center shrink-0 border border-[#D4AF37]/40">
          <Sparkles className="w-4 h-4 text-[#D4AF37]" />
        </div>
        <div className="flex items-center gap-2">
          <h4 className="text-xs sm:text-sm font-bold font-mono-label uppercase tracking-wider">
            Inspiracje i Trendy Kinowe
          </h4>
          <span className="text-[0.625rem] px-2 py-0.5 rounded-full badge-luxury font-mono-label font-bold">
            AI Director Insight
          </span>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex items-center gap-2.5 text-xs font-mono-label py-2 opacity-80">
          <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
          <span>Wyszukiwanie trendów i wskazówek operatorskich...</span>
        </div>
      ) : (
        <ul className="space-y-3">
          {tips.map((tip, idx) => (
            <motion.li 
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              key={idx} 
              className="flex items-start gap-3 text-xs leading-relaxed font-sans-modern"
            >
              <Lightbulb className="w-4 h-4 text-[#D4AF37] mt-0.5 shrink-0" />
              <span className="opacity-90">{tip}</span>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
