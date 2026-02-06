#!/bin/bash

# Cenima CLI API Test Script
# Tests all API endpoints and displays results

API_BASE="http://localhost:8000"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "     Cenima CLI API Test Suite"
echo "======================================"
echo ""

# Function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local jq_filter=$3
    
    echo -n "Testing $name... "
    response=$(curl -s "$url")
    
    if [ $? -eq 0 ] && [ ! -z "$response" ]; then
        if echo "$response" | grep -q "\"detail\""; then
            echo -e "${YELLOW}PARTIAL${NC} (No data found)"
            echo "  Response: $(echo $response | jq -c '.')"
        else
            echo -e "${GREEN}PASSED${NC}"
            if [ ! -z "$jq_filter" ]; then
                echo "$response" | jq "$jq_filter"
            fi
        fi
    else
        echo -e "${RED}FAILED${NC}"
    fi
    echo ""
}

# Test 1: Health Check
echo "1. Health Check"
echo "---------------"
test_endpoint "Health" "$API_BASE/health" "."

# Test 2: Search
echo "2. Search"
echo "---------"
test_endpoint "Search Movies" "$API_BASE/search?q=batman" ".[0] | {title, type, rating, quality}"

# Test 3: Search with Type Filter
echo "3. Search with Type Filter"
echo "--------------------------"
test_endpoint "Search Anime" "$API_BASE/search?q=one+piece&type=anime" ".[0] | {title, type, rating}"

# Save One Piece URL for next tests
ONE_PIECE_URL=$(curl -s "$API_BASE/search?q=one+piece&type=anime" | jq -r '.[0].url')
echo "  One Piece URL: $ONE_PIECE_URL"
echo ""

# Test 4: Show Details
echo "4. Show Details"
echo "---------------"
if [ ! -z "$ONE_PIECE_URL" ]; then
    response=$(curl -s "$API_BASE/show/details?url=$ONE_PIECE_URL")
    echo -n "Testing Show Details... "
    
    if echo "$response" | jq -e '.seasons' > /dev/null 2>&1; then
        echo -e "${GREEN}PASSED${NC}"
        echo "$response" | jq '{title, type, seasons: .seasons | length, first_season: .seasons[0]}'
        
        # Save first season URL
        SEASON_URL=$(echo "$response" | jq -r '.seasons[0].url')
        echo "  First Season URL: $SEASON_URL"
    else
        echo -e "${RED}FAILED${NC}"
    fi
else
    echo -e "${RED}SKIPPED${NC} (No One Piece URL found)"
fi
echo ""

# Test 5: Season Episodes
echo "5. Season Episodes"
echo "------------------"
if [ ! -z "$SEASON_URL" ]; then
    response=$(curl -s "$API_BASE/season/episodes?url=$SEASON_URL")
    echo -n "Testing Season Episodes... "
    
    if [ ! -z "$response" ] && [ "$response" != "[]" ]; then
        echo -e "${GREEN}PASSED${NC}"
        echo "$response" | jq '[.[] | {episode_number, display_number, title}] | .[0:3]'
        
        # Save first episode URL
        EPISODE_URL=$(echo "$response" | jq -r '.[0].url')
        echo "  First Episode URL: $EPISODE_URL"
    else
        echo -e "${YELLOW}PARTIAL${NC} (No episodes found)"
    fi
else
    echo -e "${RED}SKIPPED${NC} (No Season URL found)"
fi
echo ""

# Test 6: Stream Resolution
echo "6. Stream Resolution"
echo "--------------------"
if [ ! -z "$EPISODE_URL" ]; then
    echo -n "Testing Stream Resolution... "
    response=$(curl -s "$API_BASE/stream/resolve?url=$EPISODE_URL")
    
    if echo "$response" | jq -e '.video_url' > /dev/null 2>&1; then
        echo -e "${GREEN}PASSED${NC}"
        echo "$response" | jq '{server_number, video_url: .video_url[0:80], headers: .headers | keys}'
    elif echo "$response" | grep -q "No working VidTube servers found"; then
        echo -e "${YELLOW}PARTIAL${NC} (No servers available for this content)"
        echo "  This is expected - server availability varies by content"
    else
        echo -e "${RED}FAILED${NC}"
        echo "  Response: $response"
    fi
else
    echo -e "${RED}SKIPPED${NC} (No Episode URL found)"
fi
echo ""

# Summary
echo "======================================"
echo "           Test Complete"
echo "======================================"
echo ""
echo "API Documentation: http://localhost:8000/docs"
echo "ReDoc: http://localhost:8000/redoc"
echo ""
