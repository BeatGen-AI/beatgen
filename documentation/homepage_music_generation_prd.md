# PRD: Homepage Music Generation Feature

## Overview
Add instant music generation capability to the BeatGen homepage, allowing users to create complete songs from simple text prompts and save them as projects for editing in the full studio.

## Current Architecture Analysis

### AI Assistant System
The current AI assistant (`/studio/components/ai-assistant/`) provides:
- **Chat Interface**: Real-time streaming conversation
- **Three Modes**: Generate, Edit, Chat
- **Model Selection**: Multiple LLM providers (Claude, GPT, Gemini)
- **Context System**: Track-specific editing via "@" mentions
- **Action System**: Direct studio integration (add tracks, adjust BPM, etc.)

### Music Generation Service
The `MusicGenService` (`/backend/app2/llm/music_gen_service/`) offers:
- **Research Phase**: Online context gathering for musical styles
- **Parameter Determination**: AI-selected key, mode, BPM, chord progression
- **Multi-instrument Selection**: From available soundfonts
- **Parallel Generation**: Melody, chords, and drums generated concurrently
- **Professional Output**: Industry-standard MIDI and audio formats

### Current Workflow
1. User opens studio → Chat with assistant → Generate music → Manually save
2. Requires full studio interface and authentication
3. No direct project creation from generation
4. Streaming updates for engagement but complex UI

## Feature Requirements

### Core User Experience

#### **Homepage Integration**
- **Prominent CTA**: Large, centered text input with "Generate Song" button
- **Simple Interface**: Single prompt field, optional genre/mood selectors
- **Guest Access**: Allow generation before signup (with limitations)
- **Authentication Flow**: Seamless signup/login to save generated songs

#### **Generation Flow**
1. **Input**: User enters description (e.g., "upbeat rock song about summer")
2. **Processing**: Real-time progress updates with estimated time
3. **Preview**: Quick audio playback of generated composition
4. **Save Options**: Create account to save as project, or download immediately

#### **Progress Visualization**
- **Stage Indicators**: Research → Parameters → Instruments → Generation → Complete
- **Estimated Time**: 30-60 seconds total generation time
- **Cancel Option**: Ability to abort long-running generations
- **Retry Logic**: Graceful handling of failures with retry option

### Technical Implementation

#### **New API Endpoints**

**Option A: Dedicated Homepage Endpoint**
```
POST /api/homepage/generate-song
```
- **Input**: `{prompt: string, genre?: string, mood?: string, user_id?: string}`
- **Output**: Stream of progress events + final project data
- **Features**: Automatic project creation, simplified error handling

**Option B: Extend Current Assistant API**
```
POST /assistant/request (with mode: "homepage_generate")
GET /assistant/stream/{request_id}
```
- **Advantages**: Reuses existing infrastructure
- **Modifications**: Add auto-project-creation flag, simplified responses

#### **Parallel Processing Optimization**

Current music generation has sequential dependencies:
1. **Research** (online lookup) - 5-10s
2. **Parameters** (LLM call) - 3-5s  
3. **Instrument Selection** (LLM call) - 2-3s
4. **Generation** (3 parallel LLM calls) - 10-15s
5. **Project Creation** (database) - 1-2s

**Optimization Strategies**:
- **Caching**: Pre-cache common musical parameters and instrument combinations
- **Parallel Research**: Run genre research and drum research simultaneously
- **Progressive Delivery**: Return partial results (melody first, then chords, then drums)
- **Background Processing**: Queue system for heavy generation work

#### **Frontend Architecture**

**Homepage Component Structure**:
```
HomePage/
├── HeroSection.tsx
├── GenerationInterface/
│   ├── PromptInput.tsx
│   ├── GenerationProgress.tsx
│   ├── AudioPreview.tsx
│   └── SaveOptions.tsx
└── ResultsModal.tsx
```

**State Management**:
- **Generation State**: idle, processing, completed, error
- **Progress Tracking**: current stage, elapsed time, ETA
- **Audio Management**: preview playback, volume control
- **Authentication**: guest vs authenticated user states

#### **Database Schema Updates**

**Projects Table Enhancements**:
```sql
ALTER TABLE project ADD COLUMN 
  source_prompt TEXT,
  generation_metadata JSONB,
  is_from_homepage BOOLEAN DEFAULT FALSE;
```

**Generation Cache Table** (optional optimization):
```sql
CREATE TABLE generation_cache (
  prompt_hash TEXT PRIMARY KEY,
  musical_params JSONB,
  instruments JSONB,
  created_at TIMESTAMP,
  usage_count INTEGER DEFAULT 1
);
```

### Performance Requirements

#### **Generation Time Targets**
- **Fast Path**: 20-30 seconds for simple prompts
- **Standard Path**: 45-60 seconds for complex prompts  
- **Timeout**: 90 seconds maximum before failure

#### **Caching Strategy**
- **Musical Parameters**: Cache BPM, key, mode for common genres
- **Instrument Combinations**: Pre-select popular instrument pairings
- **Chord Progressions**: Store analyzed progressions for instant reuse
- **User Patterns**: Learn from user preferences for faster generation

#### **Scalability Considerations**
- **Rate Limiting**: 3 generations per hour for guests, 10 for users
- **Queue Management**: Handle concurrent generations gracefully
- **Resource Monitoring**: Track LLM API usage and costs
- **Graceful Degradation**: Fallback to simpler generation if services fail

### User Experience Features

#### **Enhanced Input Options**
- **Genre Suggestions**: Pop, Rock, Electronic, Jazz, Classical, Hip-Hop
- **Mood Selectors**: Upbeat, Chill, Energetic, Melancholic, Dreamy
- **Length Options**: Short (30s), Medium (1min), Long (2min)
- **Complexity Toggle**: Simple vs Advanced generation

#### **Audio Preview System**
- **Instant Playback**: Generated MIDI plays through web audio
- **Track Isolation**: Toggle melody, chords, drums individually  
- **Tempo Preview**: Play at different speeds
- **Volume Mixing**: Adjust relative track volumes

#### **Social Features** (Phase 2)
- **Public Gallery**: Showcase of homepage-generated songs
- **One-Click Sharing**: Direct links to generated compositions
- **Inspiration Feed**: Popular prompts and results
- **Remix Capability**: Start from others' generations

### Analytics & Metrics

#### **Generation Success Metrics**
- **Completion Rate**: % of generations that complete successfully
- **User Satisfaction**: Thumbs up/down on generated content
- **Conversion Rate**: % of guests who create accounts after generation
- **Time to Value**: Average time from prompt to playable result

#### **Technical Performance Metrics**
- **Generation Latency**: P50, P95, P99 completion times
- **Error Rates**: Failures by stage (research, LLM, generation)
- **Resource Usage**: LLM API costs per generation
- **Cache Hit Rates**: Effectiveness of optimization caching

### Implementation Phases

#### **Phase 1: MVP (2-3 weeks)** ✅ **COMPLETED**
- [x] Basic homepage interface with prompt input
- [x] Simplified generation using existing assistant API
- [x] Audio preview with basic playback
- [x] Guest generation with signup prompt
- [x] Manual project creation after generation

#### **Phase 2: Optimization (1-2 weeks)** 🚧 **IN PROGRESS**
- [x] Dedicated homepage API endpoint
- [ ] Parallel processing improvements
- [ ] Generation caching system
- [ ] Enhanced progress visualization
- [x] Automatic project creation

#### **Phase 3: Enhancement (2-3 weeks)**  
- [ ] Advanced input options (genre, mood)
- [ ] Track isolation in preview
- [ ] Social features and sharing
- [ ] Performance analytics dashboard
- [ ] Mobile-optimized interface

### Success Criteria

#### **User Engagement**
- **30% conversion rate** from homepage generation to account creation
- **Average 2.5 generations** per visitor session
- **60% completion rate** for started generations
- **4.0+ star rating** on generated content quality

#### **Technical Performance**
- **45 seconds average** generation time
- **95% uptime** for generation service
- **<5% error rate** across all generation stages
- **50% cache hit rate** for common prompts

### Risk Mitigation

#### **Technical Risks**
- **LLM API Failures**: Multiple provider fallbacks (Claude → GPT → Gemini)
- **Generation Quality**: A/B testing different prompt strategies
- **Performance Bottlenecks**: Queue system with priority tiers
- **Cost Overruns**: Budget alerts and generation caps

#### **User Experience Risks**
- **Long Wait Times**: Progressive loading and entertaining progress messages
- **Poor Results**: Retry mechanism with prompt suggestions
- **Audio Issues**: Fallback to MIDI file download
- **Mobile Experience**: Responsive design testing across devices

## Implementation Notes

### Current Architecture Strengths
- Well-architected music generation service with parallel processing capabilities
- Robust SSE streaming system for real-time updates  
- Multi-LLM support for reliability
- Professional-grade MIDI/audio output
- Modular design that can be easily extracted for homepage use

### Key API Endpoints to Leverage
- `POST /assistant/request` - Create generation request
- `GET /assistant/stream/{request_id}` - Stream generation progress
- `POST /projects` - Create project from generated content
- `GET /soundfonts` - Available instruments
- `GET /drum-samples` - Available drum sounds

### Existing Services to Reuse
- `MusicGenService.compose_music()` - Core generation logic
- `SSEQueueManager` - Real-time progress streaming
- `MusicResearcher` - Online musical context research
- `AnthropicClient` - LLM interaction wrapper
- `ProjectService` - Project creation and management

This PRD provides a comprehensive roadmap for implementing homepage music generation that leverages the existing architecture while providing a streamlined, fast user experience optimized for conversion and engagement.