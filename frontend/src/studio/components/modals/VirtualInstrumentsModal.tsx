import React, { useState, useEffect } from 'react';
import { X as CloseIcon, Piano as PianoIcon, Music as MusicNoteIcon, ChevronDown as ExpandMoreIcon, Loader2 } from 'lucide-react';
import { getPublicSoundfonts, getSoundfontDownloadUrl } from '../../../platform/api/soundfonts';
import SoundfontManager from '../../core/soundfont/soundfontManager';
import { db } from '../../core/db/dexie-client';
import { InstrumentFileRead } from 'src/platform/types/project';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../../components/ui/accordion';
import { cn } from '../../../lib/utils';
import { useAppTheme } from '../../../lib/theme-provider';

interface Instrument {
    id: string;
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
}

const instruments: Instrument[] = [
{
    id: 'piano',
    name: 'Grand Piano',
    icon: PianoIcon,
    color: '#2ECC71'
},
{
    id: 'synth',
    name: 'Synth Lead',
    icon: MusicNoteIcon,
    color: '#3498DB'
},
{
    id: 'strings',
    name: 'Strings',
    icon: MusicNoteIcon,
    color: '#9B59B6'
},
{
    id: 'bass',
    name: 'Bass',
    icon: MusicNoteIcon,
    color: '#E67E22'
},
{
    id: 'organ',
    name: 'Electric Organ',
    icon: MusicNoteIcon,
    color: '#E74C3C'
},
{
    id: 'pad',
    name: 'Ambient Pad',
    icon: MusicNoteIcon,
    color: '#1ABC9C'
}
];

// Map of instrument categories to colors
const categoryColors: Record<string, string> = {
    piano: '#2ECC71',
    synth: '#3498DB',
    strings: '#9B59B6',
    bass: '#E67E22',
    guitar: '#E67E22',
    synthesizers: '#A19E24',
    organ: '#327AB7',
    pads: '#1ABC9C',
    brass: '#F1C40F',
    woodwind: '#16A085',
    drum: '#FF5722',
    default: '#607D8B'
};

// Get color for a category
const getCategoryColor = (category: string): string => {
    return categoryColors[category.toLowerCase()] || categoryColors.default;
};

// Get icon for a category
const getCategoryIcon = (category: string): React.ComponentType<{ className?: string }> => {
    if (category === 'piano') return PianoIcon;
    return MusicNoteIcon;
};

export interface VirtualInstrumentsModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (instrumentId: string, displayName: string, storageKey?: string) => void;
}

export const VirtualInstrumentsModal = ({ open, onClose, onSelect }: VirtualInstrumentsModalProps) => {
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [soundfonts, setSoundfonts] = useState<InstrumentFileRead[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    const { studioMode } = useAppTheme();

    // Fetch available soundfonts when the modal opens
    useEffect(() => {
        if (open) {
        fetchSoundfonts();
        }
    }, [open]);

    const fetchSoundfonts = async () => {
        try {
        setLoading(true);
        setError(null);
        
        const data = await getPublicSoundfonts();
        setSoundfonts(data);
        console.log('Fetched soundfonts:', data);
        } catch (err) {
        console.error('Error fetching soundfonts:', err);
        setError('Failed to load soundfonts from library');
        } finally {
        setLoading(false);
        }
    };

    const handleSelect = (instrumentId: string) => {
        // Find the selected instrument to get its name
        const instrument = instruments.find(i => i.id === instrumentId);
        if (!instrument) {
        console.error(`Instrument with ID ${instrumentId} not found`);
        return;
        }
        onSelect(instrumentId, instrument.name);
        onClose();
    };

    const handleSoundfontSelect = async (soundfont: InstrumentFileRead) => {
        try {
            setDownloading(soundfont.id);
            setError(null);
            
            // Get the SoundfontManager instance
            const soundfontManager = SoundfontManager.getInstance(db);
            
            // Check if we already have this soundfont cached
            const isCached = await soundfontManager.isSoundfontCached(soundfont.id);
            
            if (!isCached) {
                console.log(`Downloading soundfont: ${soundfont.name}`);
                
                // The getSoundfont method will download and store the soundfont if needed
                await soundfontManager.getSoundfont(soundfont.id);
                
                console.log(`Soundfont ${soundfont.name} successfully stored`);
            } else {
                console.log(`Soundfont ${soundfont.name} already in cache`);
            }
            
            // Call onSelect with the soundfont ID, display name, and storage key
            onSelect(soundfont.id, soundfont.display_name, soundfont.storage_key);
            onClose();
            
        } catch (err) {
            console.error('Error processing soundfont:', err);
            setError(`Failed to process soundfont: ${err.message}`);
        } finally {
            setDownloading(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent 
                className="max-w-4xl max-h-[90vh] overflow-auto"
                style={{
                    backgroundColor: studioMode === 'dark' ? '#1a1a1a' : '#ffffff',
                    borderColor: studioMode === 'dark' ? '#333333' : '#e5e7eb',
                    color: studioMode === 'dark' ? '#ffffff' : '#000000'
                }}
            >
                <DialogHeader>
                    <DialogTitle style={{ color: studioMode === 'dark' ? '#ffffff' : '#000000' }}>
                        Choose Virtual Instrument
                    </DialogTitle>
                </DialogHeader>
                
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                
                {/* Quick access - Common instruments */}
                <div className="space-y-4">
                    <h3 className="text-lg font-medium">Common Instruments</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                        {instruments.map((instrument) => (
                            <div
                                key={instrument.id}
                                onClick={() => handleSelect(instrument.id)}
                                className="bg-card hover:bg-accent border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 flex flex-col items-center gap-4"
                            >
                                <div
                                    className="rounded-lg p-4 flex items-center justify-center w-16 h-16"
                                    style={{ backgroundColor: instrument.color }}
                                >
                                    <instrument.icon className="w-8 h-8 text-white" />
                                </div>
                                <h4 className="text-center font-medium text-foreground">
                                    {instrument.name}
                                </h4>
                            </div>
                        ))}
                    </div>
                    
                    {/* Explore All Virtual Instruments section */}
                    <Accordion type="single" collapsible value={expanded ? "instruments" : ""} onValueChange={(value) => setExpanded(value === "instruments")}>
                        <AccordionItem value="instruments" className="bg-card/50 rounded-lg border">
                            <AccordionTrigger className="px-4 hover:bg-accent/50 rounded-t-lg">
                                Explore All Virtual Instruments
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                                {loading ? (
                                    <div className="flex justify-center p-8">
                                        <Loader2 className="w-10 h-10 animate-spin" />
                                    </div>
                                ) : soundfonts.length === 0 ? (
                                    <p className="text-muted-foreground text-center py-4">
                                        No virtual instruments found in the library
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {soundfonts.map((soundfont) => {
                                            const isDownloading = downloading === soundfont.id;
                                            const color = getCategoryColor(soundfont.category);
                                            const Icon = getCategoryIcon(soundfont.category);
                                            
                                            return (
                                                <div
                                                    key={soundfont.id}
                                                    onClick={() => !isDownloading && handleSoundfontSelect(soundfont)}
                                                    className={cn(
                                                        "bg-card border rounded-lg p-4 transition-all duration-200 flex flex-col items-center gap-4 relative",
                                                        isDownloading ? "cursor-wait" : "cursor-pointer hover:bg-accent hover:-translate-y-0.5"
                                                    )}
                                                >
                                                    <div
                                                        className="rounded-lg p-4 flex items-center justify-center w-16 h-16"
                                                        style={{ backgroundColor: color }}
                                                    >
                                                        <Icon className="w-8 h-8 text-white" />
                                                    </div>
                                                    <div className="text-center">
                                                        <h4 className="font-medium text-foreground">
                                                            {soundfont.display_name}
                                                        </h4>
                                                        <p className="text-sm text-muted-foreground">
                                                            {soundfont.category}
                                                        </p>
                                                    </div>
                                                    
                                                    {/* Loading overlay */}
                                                    {isDownloading && (
                                                        <div className="absolute inset-0 bg-background/85 rounded-lg flex items-center justify-center z-10">
                                                            <div className="text-center">
                                                                <Loader2 className="w-10 h-10 animate-spin mb-2" />
                                                                <p className="text-sm">Downloading...</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </DialogContent>
        </Dialog>
    );
}; 