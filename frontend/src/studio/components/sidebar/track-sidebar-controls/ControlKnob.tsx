import React, { useState, useRef, useEffect } from 'react';
import { Knob } from 'primereact/knob';
import { cn } from '../../../../lib/utils';


interface ControlKnobProps {
  value: number;
  onChange: (event: Event, value: number) => void;
  onChangeCommitted?: (event: React.SyntheticEvent | Event, value: number) => void;
  min: number;
  max: number;
  step?: number;
  color?: string;
  size?: number;
  label?: string;
  type?: 'volume' | 'pan';
  valueFormatter?: (value: number) => string;
  disabled?: boolean;
}

const ControlKnob: React.FC<ControlKnobProps> = ({
  value,
  onChange,
  onChangeCommitted,
  min,
  max,
  step = 1,
  color = '#1976d2',
  size = 60,
  label,
  type,
  valueFormatter = (val) => {
    if (type === 'volume') {
      return `${val}%`;
    }
    if (type === 'pan') {
      if (val === 0) return 'C'; 
      return val < 0 ? `L${Math.abs(val)}` : `R${val}`;
    }
    return `${val}`;
  }
}) => {
  const [showSlider, setShowSlider] = useState(false);
  const [sliderPosition, setSliderPosition] = useState<'above' | 'below'>('above');
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const knobRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  
  // Normalize value for knob (0-100)
  const normalizedValue = Math.round(((value - min) / (max - min)) * 100);
  
  // Convert normalized value back to actual value
  const denormalizeValue = (norm: number) => {
    return min + (norm / 100) * (max - min);
  };
  
  const handleKnobChange = (newValue: number) => {
    const actualValue = denormalizeValue(newValue);
    // Create a synthetic event since there isn't a real one
    const syntheticEvent = new Event('change') as Event;
    onChange(syntheticEvent, actualValue);
  };
  
  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(event.target.value);
    onChange(event as any, newValue);
  };
  
  const handleSliderCommitted = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(event.target.value);
    if (onChangeCommitted) {
      onChangeCommitted(event as any, newValue);
    }
  };

  const handleSliderMouseUp = (event: React.MouseEvent<HTMLInputElement>) => {
    const newValue = parseFloat(event.currentTarget.value);
    if (onChangeCommitted) {
      onChangeCommitted(event as any, newValue);
    }
  };
  
  const checkSliderPosition = () => {
    if (knobRef.current) {
      const knobRect = knobRef.current.getBoundingClientRect();
      const sliderHeight = 120; // Approximate height of slider popup
      const sliderWidth = size <= 30 ? 150 : 200; // Match the slider width
      const topSpace = knobRect.top;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Check vertical positioning
      if (topSpace < sliderHeight && (viewportHeight - knobRect.bottom) > sliderHeight) {
        setSliderPosition('below');
      } else {
        setSliderPosition('above');
      }
      
      // Check horizontal positioning to prevent going off screen
      const knobCenterX = knobRect.left + knobRect.width / 2;
      const sliderHalfWidth = sliderWidth / 2;
      let offset = 0;
      
      // If slider would go off the left edge
      if (knobCenterX - sliderHalfWidth < 10) {
        offset = (knobCenterX - sliderHalfWidth) - 10;
      }
      // If slider would go off the right edge  
      else if (knobCenterX + sliderHalfWidth > viewportWidth - 10) {
        offset = (knobCenterX + sliderHalfWidth) - (viewportWidth - 10);
      }
      
      setHorizontalOffset(offset);
    }
  };

  const handleKnobMouseEnter = () => {
    // Clear any existing hover timeout
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    // Check position before showing
    checkSliderPosition();
    
    // Show slider
    setShowSlider(true);
  };
  
  const handleKnobMouseLeave = () => {
    // Close slider with a small delay
    hoverTimeoutRef.current = window.setTimeout(() => {
      setShowSlider(false);
    }, 100);
  };
  
  const handleSliderMouseEnter = () => {
    // Clear any pending timeout
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };
  
  const handleSliderMouseLeave = () => {
    // Delay closing to allow mouse to move between elements
    timeoutRef.current = window.setTimeout(() => {
      setShowSlider(false);
    }, 150);
  };
  
  // Clean up timeouts to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  return (
    <div className="flex flex-col items-center -mb-2">
      <div className="relative">
        <div 
          ref={knobRef}
          className="cursor-default relative -mb-2"
        >
          {/* Invisible hitbox circle */}
          <div
            onMouseEnter={handleKnobMouseEnter}
            onMouseLeave={handleKnobMouseLeave}
            className="absolute rounded-full z-[10000] cursor-pointer"
            style={{
              width: size + 20, // Make hitbox 20px larger than the knob
              height: size + 20,
              top: -10, // Offset to center the larger hitbox
              left: -10,
            }}
          />
        
          <div className="relative">
            <Knob.Root
              value={normalizedValue}
              readOnly={true}
              disabled={false} // Still want it to look active
              size={size}
              strokeWidth={size <= 30 ? 3 : 4}
              textColor="#888"
              valueColor={color}
              rangeColor="rgba(255,255,255,0.2)"
              min={0}
              max={100}
              step={1}
            >
              <Knob.Range />
              <Knob.Value />
            </Knob.Root>
            <div
              className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none"
              style={{
                marginTop: size <= 30 ? '-2px' : '-1px',
              }}
            >
              <span 
                className="text-white leading-none"
                style={{ 
                  fontSize: size <= 30 ? '0.45rem' : size <= 40 ? '0.50rem' : '0.75rem',
                  textShadow: '0px 1px 2px rgba(0,0,0,0.8)'
                }}
              >
                {valueFormatter(value)}
              </span>
            </div>
          </div>
        </div>
        
        {/* Slider overlay - render in portal */}
        {showSlider && (
          <div 
            ref={sliderRef}
            className={`fixed z-[99999] bg-[#2A2A2A] border rounded-lg shadow-lg p-4`}
            style={{ 
              borderColor: color,
              width: size <= 30 ? 150 : 200,
              left: knobRef.current ? (() => {
                const rect = knobRef.current.getBoundingClientRect();
                const sliderWidth = size <= 30 ? 150 : 200;
                const knobCenterX = rect.left + rect.width / 2;
                return `${knobCenterX - sliderWidth / 2 - horizontalOffset}px`;
              })() : '0px',
              top: knobRef.current ? (() => {
                const rect = knobRef.current.getBoundingClientRect();
                const sliderHeight = 120;
                if (sliderPosition === 'above') {
                  return `${rect.bottom - sliderHeight}px`;
                } else {
                  return `${rect.bottom}px`;
                }
              })() : '0px'
            }}
            onMouseEnter={handleSliderMouseEnter}
            onMouseLeave={handleSliderMouseLeave}
          >
            <div className="w-full">
              <input
                type="range"
                value={value}
                onChange={handleSliderChange}
                onMouseUp={handleSliderMouseUp}
                min={min}
                max={max}
                step={step}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, ${color} 0%, ${color} ${((value - min) / (max - min)) * 100}%, #374151 ${((value - min) / (max - min)) * 100}%, #374151 100%)`
                }}
              />
              <style>{`
                .slider::-webkit-slider-thumb {
                  appearance: none;
                  height: 16px;
                  width: 16px;
                  border-radius: 50%;
                  background: ${color};
                  cursor: pointer;
                  box-shadow: 0 0 2px 0 #555;
                }
                .slider::-moz-range-thumb {
                  height: 20px;
                  width: 20px;
                  border-radius: 50%;
                  background: ${color};
                  cursor: pointer;
                  border: none;
                  box-shadow: 0 0 2px 0 #555;
                }
              `}</style>
              <div className="flex justify-between mt-2">
                <span className="text-xs text-gray-400">{min}</span>
                <span className="text-xs text-white">{valueFormatter(value)}</span>
                <span className="text-xs text-gray-400">{max}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {label && (
        <span 
          className="text-gray-400 mt-px"
          style={{ 
            fontSize: size <= 30 ? '0.5rem' : size <= 40 ? '0.6rem' : '0.7rem' 
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default ControlKnob;