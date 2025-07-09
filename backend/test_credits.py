#!/usr/bin/env python3
"""Test script for credits API endpoints"""

import requests
import json

# You'll need a valid auth token from logging in
# This is just a placeholder - replace with actual token
AUTH_TOKEN = "YOUR_AUTH_TOKEN_HERE"

BASE_URL = "http://localhost:8000"
HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}

def test_get_credits_status():
    """Test getting credits status"""
    print("Testing GET /credits/status...")
    response = requests.get(f"{BASE_URL}/credits/status", headers=HEADERS)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    else:
        print(f"Error: {response.text}")
    print()

def test_get_credit_history():
    """Test getting credit history"""
    print("Testing GET /credits/history...")
    response = requests.get(f"{BASE_URL}/credits/history?limit=10", headers=HEADERS)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    else:
        print(f"Error: {response.text}")
    print()

def test_use_credits():
    """Test using credits"""
    print("Testing POST /credits/use...")
    data = {
        "amount": 1,
        "description": "Test credit usage",
        "metadata": {"test": True, "action": "test_api"}
    }
    response = requests.post(f"{BASE_URL}/credits/use", headers=HEADERS, json=data)
    print(f"Status Code: {response.status_code}")
    if response.status_code in [200, 402]:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    else:
        print(f"Error: {response.text}")
    print()

if __name__ == "__main__":
    print("=== Credits API Test ===\n")
    print("NOTE: You need to set AUTH_TOKEN with a valid JWT token from login\n")
    
    # Uncomment these when you have a valid token
    # test_get_credits_status()
    # test_get_credit_history()
    # test_use_credits()
    
    print("To get an auth token:")
    print("1. Login via the frontend")
    print("2. Check browser DevTools > Application > Local Storage")
    print("3. Look for 'sb-fmpafpwdkegazcerrnso-auth-token'")
    print("4. Copy the 'access_token' value and set it as AUTH_TOKEN")