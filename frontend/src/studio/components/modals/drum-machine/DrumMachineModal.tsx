import React, { useState, useEffect, useMemo } from 'react';
import { X as CloseIcon, ChevronDown as ExpandMoreIcon, Loader2 } from 'lucide-react';
import { getPublicDrumSamples } from '../../../../platform/api/drum_samples';
import { DrumSamplePublicRead } from 'src/platform/types/dto/public_models/drum_samples';
import { DrumSampleCard } from './DrumMachineModalCard';
import { prettyPrint } from '../../../../utils/pretty_print';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../../../components/ui/accordion';
import { Alert, AlertDescription } from '../../../../components/ui/alert';

// --- DrumMachineModal Component --- //

export interface DrumMachineModalProps {
    open: boolean;
    onClose: () => void;
    onConfirmSelection: (selectedSamples: DrumSamplePublicRead[]) => void;
}

export const DrumMachineModal = ({ open, onClose, onConfirmSelection }: DrumMachineModalProps) => {
    const [loading, setLoading] = useState(false);
    const [drumSamples, setDrumSamples] = useState<DrumSamplePublicRead[]>([]);
    const [filteredDrumSamples, setFilteredDrumSamples] = useState<DrumSamplePublicRead[]>([]);
    const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(true);

    // Filter and Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedKit, setSelectedKit] = useState<string>('All');
    const [selectedGenre, setSelectedGenre] = useState<string>('All');
    const [selectedType, setSelectedType] = useState<string>('All');

    // --- Fetching --- //

    useEffect(() => {
        if (open) {
            fetchDrumSamples();
            // Reset state when modal opens
            setSelectedSampleIds(new Set());
            setSearchQuery('');
            setSelectedKit('All');
            setSelectedGenre('All');
            setSelectedType('All');
        }
    }, [open]);

    const fetchDrumSamples = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const data = await getPublicDrumSamples();
            console.log('Fetched drum samples from API:', data);
            // Check if any samples have empty storage_key
            const samplesWithEmptyKeys = data.filter(s => !s.storage_key);
            if (samplesWithEmptyKeys.length > 0) {
                console.error('Drum samples with empty storage_key:', samplesWithEmptyKeys);
            }
            setDrumSamples(data);
            setFilteredDrumSamples(data); // Initialize filtered list
        } catch (err) {
            console.error('Error fetching drum samples:', err);
            setError('Failed to load drum samples from library');
        } finally {
            setLoading(false);
        }
    };

    // --- Filtering Logic --- //

    const uniqueKits = useMemo(() => ['All', ...new Set(drumSamples.map(s => prettyPrint(s.kit_name || 'Unknown')))], [drumSamples]);
    const uniqueGenres = useMemo(() => ['All', ...new Set(drumSamples.map(s => prettyPrint(s.genre || 'Unknown')))], [drumSamples]);
    const uniqueTypes = useMemo(() => ['All', ...new Set(drumSamples.map(s => prettyPrint(s.category || 'Unknown')))], [drumSamples]);

    useEffect(() => {
        let filtered = [...drumSamples];

        // Filter by Search Query (case-insensitive)
        if (searchQuery) {
            const lowerCaseQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(sample => 
                sample.display_name.toLowerCase().includes(lowerCaseQuery) ||
                (sample.kit_name && sample.kit_name.toLowerCase().includes(lowerCaseQuery))
            );
        }

        // Filter by Kit
        if (selectedKit !== 'All') {
            filtered = filtered.filter(sample => (sample.kit_name || 'Unknown') === selectedKit);
        }

        // Filter by Genre
        if (selectedGenre !== 'All') {
            filtered = filtered.filter(sample => (sample.genre || 'Unknown') === selectedGenre);
        }

        // Filter by Type
        if (selectedType !== 'All') {
            filtered = filtered.filter(sample => (sample.category || 'Unknown') === selectedType);
        }

        setFilteredDrumSamples(filtered);

    }, [searchQuery, selectedKit, selectedGenre, selectedType, drumSamples]);

    // --- Handlers --- //

    const handleToggleSelect = (sample: DrumSamplePublicRead) => {
        setSelectedSampleIds(prevSelectedIds => {
            const newSelectedIds = new Set(prevSelectedIds);
            if (newSelectedIds.has(sample.id)) {
                newSelectedIds.delete(sample.id);
            } else {
                newSelectedIds.add(sample.id);
            }
            return newSelectedIds;
        });
    };

    const handleConfirmSelection = () => {
        // Confirm based on the original list, using the selected IDs
        const selectedSamples = drumSamples.filter(sample => selectedSampleIds.has(sample.id));
        if (selectedSamples.length > 0) {
            console.log('Confirming selection:', selectedSamples);
            onConfirmSelection(selectedSamples);
            onClose();
        } else {
            console.warn('Confirm button clicked with no selection.');
        }
    };

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(event.target.value);
    };

    // --- Rendering --- //

    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle>Choose Drum Sample(s)</DialogTitle>
                </DialogHeader>
                
                {/* Error Alert */}
                {error && (
                    <Alert variant="destructive" className="mb-4 flex-shrink-0">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                
                {/* Main Content Area (Scrollable) */}
                <div className="flex-grow overflow-y-auto mb-4">
                    <Accordion type="single" collapsible value={expanded ? "samples" : ""} onValueChange={(value) => setExpanded(value === "samples")}>
                        <AccordionItem value="samples" className="bg-card/50 rounded-lg border">
                            <AccordionTrigger className="px-4 hover:bg-accent/50 rounded-t-lg">
                                Explore Drum Sample Library
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                                {/* Filter and Search Section */}
                                <div className="flex gap-4 mb-6 flex-wrap">
                                    <Input
                                        placeholder="Search Samples"
                                        value={searchQuery}
                                        onChange={handleSearchChange}
                                        className="flex-grow min-w-[200px]"
                                    />
                                    <Select value={selectedKit} onValueChange={setSelectedKit}>
                                        <SelectTrigger className="w-[120px]">
                                            <SelectValue placeholder="Kit" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {uniqueKits.map(kit => (
                                                <SelectItem key={kit} value={kit}>{kit}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                                        <SelectTrigger className="w-[120px]">
                                            <SelectValue placeholder="Genre" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {uniqueGenres.map(genre => (
                                                <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={selectedType} onValueChange={setSelectedType}>
                                        <SelectTrigger className="w-[120px]">
                                            <SelectValue placeholder="Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {uniqueTypes.map(type => (
                                                <SelectItem key={type} value={type}>{type}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Sample Grid */}
                                {loading ? (
                                    <div className="flex justify-center p-8">
                                        <Loader2 className="w-10 h-10 animate-spin" />
                                    </div>
                                ) : filteredDrumSamples.length === 0 ? (
                                    <p className="text-muted-foreground text-center py-4">
                                        {drumSamples.length === 0 ? 'No drum samples found in the library' : 'No samples match the current filters.'}
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {filteredDrumSamples.map((sample) => (
                                            <DrumSampleCard 
                                                key={sample.id}
                                                sample={sample}
                                                onToggleSelect={handleToggleSelect}
                                                isSelected={selectedSampleIds.has(sample.id)}
                                                isLoading={loading} 
                                            />
                                        ))}
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
                
                {/* Footer Actions */}
                <div className="flex justify-end pt-4 border-t border-border flex-shrink-0">
                    <Button
                        onClick={handleConfirmSelection}
                        disabled={selectedSampleIds.size === 0 || loading}
                    >
                        Confirm Selection ({selectedSampleIds.size})
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}; 