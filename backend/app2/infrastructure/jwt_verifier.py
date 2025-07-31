"""
JWT verification using Supabase's asymmetric signing keys (RS256/ES256)
Caches public keys locally to avoid API calls during verification
Based on: https://supabase.com/blog/jwt-signing-keys
"""

import jwt
import httpx
import time
import asyncio
from typing import Dict, Any, Optional
from urllib.parse import urljoin
from cachetools import TTLCache
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from app2.core.config import settings
from app2.core.logging import get_logger
from app2.core.exceptions import UnauthorizedException

logger = get_logger("beatgen.jwt_verifier")

class JWTVerifier:
    """JWT verifier that fetches and caches Supabase asymmetric signing keys"""
    
    def __init__(self):
        # Cache signing keys for 1 hour (more aggressive caching)
        self._keys_cache = TTLCache(maxsize=10, ttl=3600)  # 1 hour
        self._fetch_lock = asyncio.Lock()
        self._warmed_up = False
        self._cache_hits = 0
        self._cache_misses = 0
        logger.info(f"🔧 JWT Verifier initialized with cache TTL: 3600s (1 hour)")
    
    async def warm_cache(self):
        """Pre-warm the cache with JWT signing keys on startup"""
        if not self._warmed_up:
            try:
                logger.info("🔥 Warming up JWT key cache...")
                await self.get_signing_keys()
                self._warmed_up = True
                logger.info("✅ JWT key cache warmed up successfully")
                
                # Start background refresh task
                asyncio.create_task(self._background_refresh())
            except Exception as e:
                logger.warning(f"⚠️ Failed to warm JWT key cache: {e}")
                # Don't fail startup if cache warming fails
    
    async def _background_refresh(self):
        """Background task to refresh cache before expiration"""
        while True:
            try:
                # Refresh every 50 minutes (10 minutes before 1-hour expiration)
                await asyncio.sleep(3000)  # 50 minutes
                logger.info("🔄 Background refresh of JWT keys...")
                
                # Force refresh by temporarily clearing cache
                if 'jwks' in self._keys_cache:
                    del self._keys_cache['jwks']
                await self.get_signing_keys()
                logger.info("✅ Background JWT key refresh completed")
                
            except Exception as e:
                logger.error(f"❌ Background JWT key refresh failed: {e}")
                # Continue the loop even if refresh fails
                await asyncio.sleep(300)  # Wait 5 minutes before retrying
        
    async def get_signing_keys(self) -> Dict[str, Any]:
        """Fetch Supabase JWT signing keys with caching"""
        
        # Debug cache state
        cache_size = len(self._keys_cache)
        logger.debug(f"🔍 Cache debug: size={cache_size}, has_jwks={'jwks' in self._keys_cache}")
        
        # Check cache first
        if 'jwks' in self._keys_cache:
            self._cache_hits += 1
            logger.info(f"📦 Using cached JWT signing keys (fast) - Cache hits: {self._cache_hits}")
            return self._keys_cache['jwks']
        
        # Use lock to prevent multiple concurrent fetches
        async with self._fetch_lock:
            # Double-check cache after acquiring lock
            if 'jwks' in self._keys_cache:
                return self._keys_cache['jwks']
            
            try:
                # Construct JWKS URL as per Supabase documentation
                jwks_url = urljoin(settings.supabase.URL, "/auth/v1/.well-known/jwks.json")
                logger.info(f"🌐 Fetching JWT signing keys from: {jwks_url}")
                
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(jwks_url)
                    response.raise_for_status()
                    
                jwks_data = response.json()
                self._cache_misses += 1
                logger.info(f"📥 Successfully fetched {len(jwks_data.get('keys', []))} JWT signing keys from Supabase - Cache misses: {self._cache_misses}")
                
                # Cache the keys
                self._keys_cache['jwks'] = jwks_data
                
                return jwks_data
                
            except Exception as e:
                logger.error(f"Failed to fetch JWT signing keys: {str(e)}")
                # If we have expired keys, use them as fallback
                try:
                    if hasattr(self._keys_cache, '_data') and 'jwks' in self._keys_cache._data:
                        logger.warning("Using expired JWT keys as fallback")
                        return self._keys_cache._data['jwks']
                except:
                    pass
                raise
    
    def _jwk_to_key(self, jwk_data: Dict[str, Any]):
        """Convert JWK to cryptographic key object"""
        try:
            from jwt.algorithms import RSAAlgorithm, ECAlgorithm
            # Use PyJWT's built-in JWK handling
            if jwk_data.get('kty') == 'RSA':
                return RSAAlgorithm.from_jwk(jwk_data)
            elif jwk_data.get('kty') == 'EC':
                return ECAlgorithm.from_jwk(jwk_data)
            else:
                raise ValueError(f"Unsupported key type: {jwk_data.get('kty')}")
        except Exception as e:
            logger.error(f"Failed to convert JWK to key: {str(e)}")
            raise
    
    async def verify_token(self, token: str) -> Dict[str, Any]:
        """
        Verify JWT token using Supabase asymmetric signing keys
        
        Args:
            token: JWT token to verify
            
        Returns:
            Decoded token payload
            
        Raises:
            UnauthorizedException: If token is invalid
        """
        try:
            logger.debug(f"Verifying JWT token: {token[:10]}...")
            
            # Get signing keys (cached after first fetch)
            jwks_data = await self.get_signing_keys()
            
            # Decode token header to get key ID and algorithm
            unverified_header = jwt.get_unverified_header(token)
            key_id = unverified_header.get('kid')
            algorithm = unverified_header.get('alg')
            
            if not key_id:
                raise UnauthorizedException("Token missing key ID")
            
            # Find the matching key
            signing_key = None
            for key_data in jwks_data.get('keys', []):
                if key_data.get('kid') == key_id:
                    signing_key = self._jwk_to_key(key_data)
                    break
            
            if not signing_key:
                # Check if this is a legacy HS256 token during transition period
                if algorithm == 'HS256':
                    logger.warning(f"Legacy HS256 token detected (key ID: {key_id}) - this will be handled by API fallback")
                    raise UnauthorizedException(f"Legacy HS256 token not supported in JWT verification (key ID: {key_id})")
                else:
                    raise UnauthorizedException(f"No signing key found for key ID: {key_id}")
            
            # Determine algorithm - support both RS256 and ES256 (ECC P-256)
            algorithms = ['RS256', 'ES256'] if not algorithm else [algorithm]
            
            # Verify and decode token
            # Supabase JWT issuer includes /auth/v1 path
            expected_issuer = urljoin(settings.supabase.URL, "/auth/v1")
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=algorithms,
                audience='authenticated',  # Supabase default audience
                issuer=expected_issuer,
            )
            
            logger.info(f"🔑 Successfully verified JWT ({algorithm}) with key {key_id} for user: {payload.get('sub')}")
            
            # Return user info in expected format
            return {
                'id': payload.get('sub'),  # Subject is the user ID
                'email': payload.get('email'),
                'aud': payload.get('aud'),
                'role': payload.get('role'),
                'exp': payload.get('exp'),
                'iat': payload.get('iat'),
                'user_metadata': payload.get('user_metadata', {}),  # Include user metadata
            }
            
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token has expired")
            raise UnauthorizedException("Token has expired")
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {str(e)}")
            raise UnauthorizedException(f"Invalid token: {str(e)}")
        except Exception as e:
            logger.error(f"JWT verification error: {str(e)}")
            raise UnauthorizedException(f"Token verification failed: {str(e)}")

# Global singleton instance - ensure only one instance exists per process
_jwt_verifier_instance = None

def get_jwt_verifier() -> JWTVerifier:
    """Get the global JWT verifier instance (singleton pattern)"""
    global _jwt_verifier_instance
    if _jwt_verifier_instance is None:
        logger.info("🚀 Creating global JWT verifier instance")
        _jwt_verifier_instance = JWTVerifier()
    return _jwt_verifier_instance

# For backward compatibility
jwt_verifier = get_jwt_verifier()