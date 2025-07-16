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
  audioUrl?: string; // Storage key for the audio file (not a full URL)
  audioBlob?: Blob; // Direct blob data
  variant: 'track' | 'card' | 'full';
  duration?: number; // Required for track variant
  isPlaying?: boolean;
  className?: string;
  color?: string;
}

const AudioPreview: React.FC<AudioPreviewProps> = ({
  audioUrl,
  audioBlob,
  variant,
  duration,
  isPlaying = false,
  className,
  color
}) => {
  
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, number[]>>(new Map());
  const effectRunCount = useRef(0);
  const prevWaveformDataRef = useRef<number[]>([]);
  
  // Use provided color or fallback to a neutral color
  const waveformColor = color || 'rgba(139, 69, 19, 0.8)'; // Default brownish color
  const backgroundColor = 'transparent';
  const skeletonColor = 'rgba(0, 0, 0, 0.1)';
  const errorBg = 'rgba(0, 0, 0, 0.1)';
  const errorText = 'rgba(0, 0, 0, 0.6)';

  // Track waveform data changes
  useEffect(() => {
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

  const analyzeAudio = async (source: string | Blob, barCount: number, fallbackUrl?: string): Promise<number[]> => {
    const cacheKey = typeof source === 'string' ? `${source}_${barCount}` : `blob_${barCount}`;
    
    // Check cache first
    if (cacheRef.current.has(cacheKey)) {
      return cacheRef.current.get(cacheKey)!;
    }

    try {
      // Use global audio context
      const audioContext = getGlobalAudioContext();
      
      // Resume audio context if it's suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      let audioBlob: Blob;
      
      if (source && typeof source === 'object' && source.size > 0 && source.type) {
        // Use blob directly - no network request needed
        console.log('AudioPreview: Using blob directly, size:', source.size, 'type:', source.type);
        audioBlob = source;
      } else {
        // Validate storage key first
        if (!source || source.trim() === '') {
          throw new Error('Invalid storage key');
        }
        console.log('AudioPreview: Downloading audio file for storage key:', source);
        // Download audio file using the API
        audioBlob = await downloadAudioTrackFile(source);
      }
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Empty audio file');
      }
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      if (audioBuffer.length === 0) {
        throw new Error('Invalid audio data');
      }
      
      // Extract channel data (use first channel)
      const channelData = audioBuffer.getChannelData(0);
      
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
      
      return normalizedData;
      
    } catch (err) {
      console.error('Audio analysis failed:', err);
      
      // If we have a fallback URL and the blob failed, try the fallback
      if (fallbackUrl && typeof source === 'object') {
        console.log('AudioPreview: Blob failed, trying fallback URL:', fallbackUrl);
        try {
          return await analyzeAudio(fallbackUrl, barCount);
        } catch (fallbackErr) {
          console.error('AudioPreview: Fallback URL also failed:', fallbackErr);
        }
      }
      
      throw err;
    }
  };

  useEffect(() => {
    effectRunCount.current += 1;
    
    // Determine the audio source - prioritize blob over URL
    let audioSource: string | Blob | null = null;
    
    console.log('AudioPreview: Determining source', { 
      hasBlob: !!audioBlob, 
      blobSize: audioBlob?.size, 
      blobType: audioBlob?.type,
      hasUrl: !!audioUrl,
      audioUrl: audioUrl 
    });
    
    if (audioBlob && audioBlob.size > 0 && audioBlob.type) {
      console.log('AudioPreview: Using blob as source');
      audioSource = audioBlob;
    } else if (audioUrl && audioUrl.trim() !== '') {
      console.log('AudioPreview: Using URL as source:', audioUrl);
      audioSource = audioUrl;
    }
    
    if (!audioSource) {
      // Generate fallback waveform for missing source
      const fallbackData = Array.from({ length: getBarCount() }, () => Math.random() * 0.3);
      setWaveformData(fallbackData);
      setIsLoading(false);
      setError(null);
      return;
    }

    const loadWaveform = async () => {
      // Check if we already have cached data for this exact configuration
      const cacheKey = typeof audioSource === 'string' ? `${audioSource}_${getBarCount()}` : `blob_${getBarCount()}`;
      if (cacheRef.current.has(cacheKey)) {
        const cachedData = cacheRef.current.get(cacheKey)!;
        setWaveformData(cachedData);
        setIsLoading(false);
        setError(null);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Pass fallback URL when using blob source
        const fallbackUrl = typeof audioSource === 'object' && audioUrl ? audioUrl : undefined;
        const data = await analyzeAudio(audioSource!, getBarCount(), fallbackUrl);
        setWaveformData(data);
      } catch (err) {
        console.error('AudioPreview: Failed to load waveform:', err);
        setError(err instanceof Error ? err.message : 'Failed to load audio');
        // Generate fallback waveform for error state
        const fallbackData = Array.from({ length: getBarCount() }, () => Math.random() * 0.3);
        setWaveformData(fallbackData);
      } finally {
        setIsLoading(false);
      }
    };

    loadWaveform();
  }, [audioUrl, audioBlob, variant]);


  // Note: We're using a global audio context that persists across component lifecycles

  const renderBars = () => {
    const barCount = getBarCount();
    const data = waveformData.length > 0 ? waveformData : Array(barCount).fill(0);
    
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
    </div>
  );
};

export default AudioPreview;