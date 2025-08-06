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
  audioUrl: string; // Storage key for the audio file or blob URL
  variant: 'track' | 'card';
  duration?: number; // Required for track variant
  isPlaying?: boolean;
  className?: string;
  color?: string;
  currentTime?: number; // Current playback time in seconds
  onWaveformClick?: (position: number) => void; // Callback for clicking on waveform (position 0-1)
}

const AudioPreview: React.FC<AudioPreviewProps> = ({
  audioUrl,
  variant,
  duration,
  isPlaying = false,
  className,
  color,
  currentTime = 0,
  onWaveformClick
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

  const analyzeAudio = async (audioUrlOrKey: string, barCount: number): Promise<number[]> => {
    const cacheKey = `${audioUrlOrKey}_${barCount}`;
    
    // Check cache first
    if (cacheRef.current.has(cacheKey)) {
      return cacheRef.current.get(cacheKey)!;
    }

    try {
      // Validate input first
      if (!audioUrlOrKey || audioUrlOrKey.trim() === '') {
        throw new Error('Invalid audio URL or storage key');
      }

      
      // Use global audio context
      const audioContext = getGlobalAudioContext();
      
      // Resume audio context if it's suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      
      // Determine if this is a blob URL or storage key
      let audioBlob: Blob;
      if (audioUrlOrKey.startsWith('blob:')) {
        // Fetch from blob URL
        try {
          const response = await fetch(audioUrlOrKey);
          if (!response.ok) {
            // Blob URL might be expired or revoked
            console.warn(`Blob URL expired or not found: ${audioUrlOrKey}`);
            throw new Error('Blob URL expired or not found');
          }
          audioBlob = await response.blob();
        } catch (blobError) {
          // If blob URL fails, it might be expired
          console.warn('Failed to fetch blob URL, it may have expired:', blobError);
          throw new Error('Audio data no longer available (blob expired)');
        }
      } else {
        // Download audio file using the API (storage key)
        try {
          audioBlob = await downloadAudioTrackFile(audioUrlOrKey);
        } catch (downloadError) {
          // If the file doesn't exist in storage, throw a specific error
          console.warn(`Failed to download audio file: ${audioUrlOrKey}`, downloadError);
          throw new Error('Audio file not found or unavailable');
        }
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
      throw err;
    }
  };

  useEffect(() => {
    effectRunCount.current += 1;
    
    if (!audioUrl || audioUrl.trim() === '') {
      // Generate fallback waveform for missing URL
      const fallbackData = Array.from({ length: getBarCount() }, () => Math.random() * 0.3);
      setWaveformData(fallbackData);
      setIsLoading(false);
      setError(null);
      return;
    }


    const loadWaveform = async () => {
      
      // Check if we already have cached data for this exact configuration
      const cacheKey = `${audioUrl}_${getBarCount()}`;
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
        const data = await analyzeAudio(audioUrl, getBarCount());
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
  }, [audioUrl, variant]);


  // Note: We're using a global audio context that persists across component lifecycles

  const renderBars = () => {
    const barCount = getBarCount();
    const data = waveformData.length > 0 ? waveformData : Array(barCount).fill(0);
    
    // Calculate the current position as a ratio (0-1) of total duration
    const currentPosition = duration ? currentTime / duration : 0;
    const currentBarIndex = Math.floor(currentPosition * barCount);
    
    return data.map((amplitude, index) => {
      const height = Math.max(2, amplitude * 100); // Convert to percentage
      const isPlayed = currentTime == 0 || (currentTime > 0 && index < currentBarIndex);
      
      // Use a lighter/muted color for unplayed portions
      let barColor: string;
      if (isPlayed) {
        barColor = waveformColor;
      } else {
        // Handle different color formats
        if (waveformColor.startsWith('rgba(')) {
          // Extract values from rgba
          const match = waveformColor.match(/rgba?\(([^)]+)\)/);
          if (match) {
            const values = match[1].split(',').map((v: string) => v.trim());
            if (values.length >= 3) {
              const opacity = values.length === 4 ? parseFloat(values[3]) * 0.3 : 0.3;
              barColor = `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${opacity})`;
            } else {
              barColor = waveformColor;
            }
          } else {
            barColor = waveformColor;
          }
        } else if (waveformColor.startsWith('rgb(')) {
          // Convert rgb to rgba with reduced opacity
          const match = waveformColor.match(/rgb\(([^)]+)\)/);
          if (match) {
            barColor = `rgba(${match[1]}, 0.3)`;
          } else {
            barColor = waveformColor;
          }
        } else {
          // For hex colors or named colors, use CSS opacity
          barColor = waveformColor;
        }
      }
      
      return (
        <div
          key={index}
          className={cn(
            'flex-1 rounded-full transition-all duration-200 ease-out',
            className
          )}
          style={{
            height: `${height}%`,
            backgroundColor: barColor,
            opacity: isLoading ? 0.5 : (!isPlayed && !barColor.includes('rgba') ? 0.3 : 1.0),
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


  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (onWaveformClick) {
      const rect = event.currentTarget.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const position = clickX / rect.width;
      onWaveformClick(Math.max(0, Math.min(1, position))); // Clamp between 0 and 1
    }
  };

  return (
    <div 
      className={cn(
        'flex items-center gap-0.5 px-2 py-1 rounded overflow-hidden relative',
        onWaveformClick && 'cursor-pointer',
        className
      )}
      style={{
        width: getContainerWidth(),
        height: getContainerHeight(),
        backgroundColor: backgroundColor
      }}
      onClick={handleClick}
    >
      {isLoading ? renderSkeletonBars() : renderBars()}
      
      {/* {error && (
        <div 
          className="absolute inset-0 flex items-center justify-center rounded"
          style={{ backgroundColor: errorBg }}
        >
          <span className="text-xs" style={{ color: errorText }}>
            {error}
          </span>
        </div>
      )} */}
    </div>
  );
};

export default AudioPreview;