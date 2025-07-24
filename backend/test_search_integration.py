#!/usr/bin/env python3
"""
Test script to verify the search service integration in MusicAgent
"""

import asyncio
import logging
from sqlmodel import Session
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.llm.agents.music_agent import MusicAgent, MusicGenerationContext
from app2.llm.music_gen_service.llm_schemas import FullMusicalParameters
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.llm.model_info import ModelInfo

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_search_integration():
    """Test the search service integration in select_instruments and select_drum_sounds"""
    
    # Create a test session
    with next(get_session()) as session:
        # Initialize MusicAgent
        agent = MusicAgent()
        
        # Create a mock context
        queue = SSEQueueManager()
        model_info = ModelInfo(
            provider="test",
            model_name="test-model",
            temperature=0.7,
            max_tokens=1000
        )
        
        agent.context = MusicGenerationContext(
            model_info=model_info,
            queue=queue
        )
        
        # Initialize real data (includes search service)
        await agent._init_real_data(session)
        
        # Create test musical parameters
        test_params = FullMusicalParameters(
            chord_progression="C-G-Am-F",
            key="C",
            mode="major",
            tempo=120,
            melody_instrument_suggestion="piano",
            chords_instrument_suggestion="guitar",
            song_title="Test Song",
            original_user_prompt="Create a happy upbeat song",
            duration_bars=8
        )
        
        try:
            # Test select_instruments with search
            logger.info("Testing select_instruments with search service...")
            selected_instruments = await agent.select_instruments(test_params)
            logger.info(f"Selected instruments: {selected_instruments.model_dump_json(indent=2)}")
            
            # Test select_drum_sounds with search
            logger.info("\nTesting select_drum_sounds with search service...")
            selected_drums = await agent.select_drum_sounds(test_params)
            logger.info(f"Selected drum sounds: {selected_drums.model_dump_json(indent=2)}")
            
            # Verify the results
            if selected_instruments.instrument_selections:
                logger.info("\n✅ Instrument selection successful!")
                for item in selected_instruments.instrument_selections:
                    logger.info(f"  - {item.role}: {item.instrument_name}")
            else:
                logger.warning("⚠️  No instruments selected")
                
            if selected_drums.drum_sounds:
                logger.info("\n✅ Drum sound selection successful!")
                for drum in selected_drums.drum_sounds:
                    logger.info(f"  - {drum}")
            else:
                logger.warning("⚠️  No drum sounds selected")
                
        except Exception as e:
            logger.error(f"Error during testing: {e}")
            import traceback
            traceback.print_exc()
        
        # Close the queue
        await queue.close()

if __name__ == "__main__":
    asyncio.run(test_search_integration())