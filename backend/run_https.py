#!/usr/bin/env python3
"""
Run the backend server with HTTPS
"""

import uvicorn
import os

if __name__ == "__main__":
    # Set environment variables if needed
    os.environ["ASYNC_DATABASE_URL"] = os.environ.get("ASYNC_DATABASE_URL", "")
    
    # Run with SSL
    uvicorn.run(
        "app2.main_with_search:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        ssl_keyfile="./.cert/key.pem",
        ssl_certfile="./.cert/cert.pem"
    )