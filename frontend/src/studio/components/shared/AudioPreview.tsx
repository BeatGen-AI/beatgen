import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { downloadAudioTrackFile } from '../../../platform/api/sounds';

// Global audio context to prevent it from being closed/recreated
let globalAudioContext: AudioContext | null = null;

const getGlobalAudioContext = () => {
  if (!globalAudioContext || globalAudioContext.state === 'closed') {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return globalAudioContext;
};

interface AudioPreviewProps {
  audioUrl: string; // Storage key for the audio file (not a full URL)
  variant: 'track' | 'card';
  duration?: number; // Required for track variant
  isPlaying?: boolean;
  className?: string;
  color?: string;
}

const AudioPreview: React.FC<AudioPreviewProps> = ({
  audioUrl,
  variant,
  duration,
  isPlaying = false,
  className,
  color
}) => {
  console.log('AudioPreview: Component render with audioUrl:', audioUrl);
  
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, number[]>>(new Map());
  const effectRunCount = useRef(0);
  const prevWaveformDataRef = useRef<number[]>([]);
  
  // Use provided color or fallback to a neutral color
  const waveformColor = color || 'rgba(139, 69, 19, 0.8)'; // Default brownish color
  console.log('AudioPreview: color prop received:', color, 'final waveformColor:', waveformColor);
  const backgroundColor = 'transparent';
  const skeletonColor = 'rgba(0, 0, 0, 0.1)';
  const errorBg = 'rgba(0, 0, 0, 0.1)';
  const errorText = 'rgba(0, 0, 0, 0.6)';

  // Track waveform data changes
  useEffect(() => {
    const prevLength = prevWaveformDataRef.current.length;
    console.log('AudioPreview: WaveformData state changed from', prevLength, 'to', waveformData.length, 'bars');
    
    if (waveformData.length > 0) {
      console.log('AudioPreview: New waveform data sample:', waveformData.slice(0, 10));
    }
    
    if (prevLength > 0 && waveformData.length === 0) {
      console.warn('AudioPreview: WAVEFORM DATA WAS CLEARED! Previous had', prevLength, 'bars');
      console.trace('AudioPreview: Stack trace for waveform clearing');
    }
    
    prevWaveformDataRef.current = waveformData;
  }, [waveformData]);

  // Calculate dimensions based on variant
  const getBarCount = () => {
    switch (variant) {
      case 'track':
        return duration ? Math.min(Math.max(duration * 5, 50), 400) : 100;
      case 'card':
        return 50;
      default:
        return 50;
    }
  };

  const getContainerWidth = () => {
    if (variant === 'track' && duration) {
      return `${duration * 20}px`; // 20px per second
    }
    return '100%'; // Full width for card variant
  };

  const getContainerHeight = () => {
    switch (variant) {
      case 'track':
        return '40px';
      case 'card':
        return '60px';
      default:
        return '60px';
    }
  };

  const analyzeAudio = async (storageKey: string, barCount: number): Promise<number[]> => {
    const cacheKey = `${storageKey}_${barCount}`;
    
    console.log('AudioPreview: analyzeAudio called with storageKey:', storageKey);
    
    // Check cache first
    if (cacheRef.current.has(cacheKey)) {
      console.log('AudioPreview: Found cached waveform data');
      return cacheRef.current.get(cacheKey)!;
    }

    try {
      // Validate storage key first
      if (!storageKey || storageKey.trim() === '') {
        throw new Error('Invalid storage key');
      }

      console.log('AudioPreview: Getting audio context');
      
      // Use global audio context
      const audioContext = getGlobalAudioContext();
      console.log('AudioPreview: Audio context state:', audioContext.state);
      
      // Resume audio context if it's suspended
      if (audioContext.state === 'suspended') {
        console.log('AudioPreview: Resuming suspended audio context');
        await audioContext.resume();
      }

      console.log('AudioPreview: Downloading audio file for storage key:', storageKey);
      
      // Download audio file using the API
      const audioBlob = await downloadAudioTrackFile(storageKey);
      console.log('AudioPreview: Downloaded blob size:', audioBlob.size, 'type:', audioBlob.type);
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      console.log('AudioPreview: ArrayBuffer size:', arrayBuffer.byteLength);
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Empty audio file');
      }
      
      console.log('AudioPreview: Decoding audio data...');
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log('AudioPreview: Audio decoded successfully - duration:', audioBuffer.duration, 'channels:', audioBuffer.numberOfChannels);
      
      if (audioBuffer.length === 0) {
        throw new Error('Invalid audio data');
      }
      
      // Extract channel data (use first channel)
      const channelData = audioBuffer.getChannelData(0);
      console.log('AudioPreview: Channel data length:', channelData.length);
      
      // Calculate samples per bar
      const samplesPerBar = Math.floor(channelData.length / barCount);
      const waveformData: number[] = [];
      
      // Generate waveform data using RMS
      for (let i = 0; i < barCount; i++) {
        const startIndex = i * samplesPerBar;
        const endIndex = Math.min(startIndex + samplesPerBar, channelData.length);
        
        // Calculate RMS (Root Mean Square) for better visual representation
        let sum = 0;
        for (let j = startIndex; j < endIndex; j++) {
          sum += channelData[j] * channelData[j];
        }
        const rms = Math.sqrt(sum / (endIndex - startIndex));
        waveformData.push(rms || 0); // Fallback to 0 if NaN
      }
      
      // Normalize to 0-1 range
      const maxAmplitude = Math.max(...waveformData);
      const normalizedData = waveformData.map(val => maxAmplitude > 0 ? val / maxAmplitude : 0);
      
      // Cache the result
      cacheRef.current.set(cacheKey, normalizedData);
      
      console.log('AudioPreview: Analysis complete! Generated waveform data:', normalizedData.length, 'bars');
      console.log('AudioPreview: Sample waveform values:', normalizedData.slice(0, 10));
      console.log('AudioPreview: Max amplitude in generated data:', Math.max(...normalizedData));
      
      return normalizedData;
      
    } catch (err) {
      console.error('Audio analysis failed:', err);
      throw err;
    }
  };

  useEffect(() => {
    effectRunCount.current += 1;
    console.log('AudioPreview: MAIN EFFECT RUNNING! (run #' + effectRunCount.current + ')');
    console.log('AudioPreview: Effect triggered with audioUrl:', audioUrl, 'type:', typeof audioUrl, 'trimmed:', audioUrl?.trim());
    console.log('AudioPreview: Effect dependencies - variant:', variant, 'duration:', duration);
    console.log('AudioPreview: Current waveformData length:', waveformData.length);
    
    if (!audioUrl || audioUrl.trim() === '') {
      console.log('AudioPreview: No audio URL provided, showing fallback (effect run #' + effectRunCount.current + ')');
      // Generate fallback waveform for missing URL
      const fallbackData = Array.from({ length: getBarCount() }, () => Math.random() * 0.3);
      console.log('AudioPreview: Setting fallback data:', fallbackData.slice(0, 5), '(effect run #' + effectRunCount.current + ')');
      console.log('AudioPreview: Current waveform data before fallback:', waveformData.length, 'bars');
      setWaveformData(fallbackData);
      setIsLoading(false);
      setError(null);
      return;
    }

    console.log('AudioPreview: Loading waveform for storage key:', audioUrl);

    const loadWaveform = async () => {
      console.log('AudioPreview: Starting waveform load');
      
      // Check if we already have cached data for this exact configuration
      const cacheKey = `${audioUrl}_${getBarCount()}`;
      if (cacheRef.current.has(cacheKey)) {
        console.log('AudioPreview: Using cached waveform data');
        const cachedData = cacheRef.current.get(cacheKey)!;
        setWaveformData(cachedData);
        setIsLoading(false);
        setError(null);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await analyzeAudio(audioUrl, getBarCount());
        console.log('AudioPreview: Waveform data generated:', data.length, 'bars, sample values:', data.slice(0, 10));
        console.log('AudioPreview: About to set waveform data in state (effect run #' + effectRunCount.current + ')');
        console.log('AudioPreview: Current waveform data before setting:', waveformData.length, 'bars');
        setWaveformData(data);
        console.log('AudioPreview: setWaveformData called with:', data.length, 'bars (effect run #' + effectRunCount.current + ')');
      } catch (err) {
        console.error('AudioPreview: Failed to load waveform:', err);
        setError(err instanceof Error ? err.message : 'Failed to load audio');
        // Generate fallback waveform for error state
        const fallbackData = Array.from({ length: getBarCount() }, () => Math.random() * 0.3);
        console.log('AudioPreview: Setting error fallback data:', fallbackData.slice(0, 5), '(effect run #' + effectRunCount.current + ')');
        console.log('AudioPreview: Current waveform data before error fallback:', waveformData.length, 'bars');
        setWaveformData(fallbackData);
      } finally {
        setIsLoading(false);
      }
    };

    loadWaveform();
  }, [audioUrl, variant]);

  // Debug useEffect to track individual dependency changes
  useEffect(() => {
    console.log('AudioPreview: audioUrl dependency changed to:', audioUrl);
  }, [audioUrl]);
  
  useEffect(() => {
    console.log('AudioPreview: variant dependency changed to:', variant);
  }, [variant]);
  
  useEffect(() => {
    console.log('AudioPreview: duration dependency changed to:', duration);
  }, [duration]);

  // Note: We're using a global audio context that persists across component lifecycles

  const renderBars = () => {
    const barCount = getBarCount();
    const data = waveformData.length > 0 ? waveformData : Array(barCount).fill(0);
    
    console.log('AudioPreview: Rendering bars with data:', data.length, 'bars, isLoading:', isLoading);
    console.log('AudioPreview: Sample amplitude values:', data.slice(0, 10));
    console.log('AudioPreview: Max amplitude:', Math.max(...data));
    
    return data.map((amplitude, index) => {
      const height = Math.max(2, amplitude * 100); // Convert to percentage
      
      return (
        <div
          key={index}
          className={cn(
            'flex-1 rounded-full transition-all duration-200 ease-out',
            isPlaying && 'animate-pulse',
            className
          )}
          style={{
            height: `${height}%`,
            backgroundColor: waveformColor,
            opacity: isLoading ? 0.5 : 1.0,
            minHeight: '2px',
            marginRight: index < data.length - 1 ? '1px' : '0'
          }}
        />
      );
    });
  };

  const renderSkeletonBars = () => {
    const barCount = getBarCount();
    return Array.from({ length: barCount }, (_, index) => (
      <div
        key={index}
        className="flex-1 rounded-full animate-pulse"
        style={{
          height: `${Math.random() * 60 + 20}%`,
          backgroundColor: skeletonColor,
          minHeight: '2px',
          marginRight: index < barCount - 1 ? '1px' : '0'
        }}
      />
    ));
  };

  console.log('AudioPreview: Rendering component with state:', {
    audioUrl,
    isLoading,
    error,
    waveformDataLength: waveformData.length,
    width: getContainerWidth(),
    height: getContainerHeight()
  });

  return (
    <div 
      className={cn(
        'flex items-center gap-0.5 px-2 py-1 rounded overflow-hidden relative',
        className
      )}
      style={{
        width: getContainerWidth(),
        height: getContainerHeight(),
        backgroundColor: backgroundColor
      }}
    >
      {isLoading ? renderSkeletonBars() : renderBars()}
      
      {error && (
        <div 
          className="absolute inset-0 flex items-center justify-center rounded"
          style={{ backgroundColor: errorBg }}
        >
          <span className="text-xs" style={{ color: errorText }}>
            Failed to load
          </span>
        </div>
      )}
    </div>
  );
};

export default AudioPreview;