#!/bin/bash

# Configuration
LOAD_BALANCER_URL="http://localhost:9000/api/echo"
NUM_REQUESTS=30
PAYLOAD='{"game":"Mobile Legends", "gamerID":"GYUTDTE", "points":20}'

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Performance Test - Sending $NUM_REQUESTS parallel requests to $LOAD_BALANCER_URL${NC}"
echo -e "${BLUE}Payload: $PAYLOAD${NC}"
echo -e "${BLUE}======================================================${NC}"

# Function to send a single request and measure response time
send_request() {
  local id=$1
  # Use curl with -w option to measure timing, -s for silent mode
  local result=$(curl -s -w "\n%{time_total}" -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$LOAD_BALANCER_URL")

  # Extract response and time from curl output
  local response=$(echo "$result" | head -n 1)
  local time=$(echo "$result" | tail -n 1)

  # Format time to 3 decimal places
  local formatted_time=$(printf "%.3f" $time)

  # Determine color based on response time
  local time_color="$GREEN"
  if (( $(echo "$time > 0.5" | bc -l) )); then
    time_color="$YELLOW"
  fi
  if (( $(echo "$time > 1.0" | bc -l) )); then
    time_color="$RED"
  fi

  echo -e "Request ${id}: ${time_color}${formatted_time}s${NC} - Response: ${response}"
}

# Send requests in parallel
echo "Starting parallel requests..."

for i in $(seq 1 $NUM_REQUESTS); do
  send_request $i &
done

# Wait for all background processes to complete
wait

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}All requests completed.${NC}"

# Get performance stats after the test
echo -e "${BLUE}Fetching performance statistics...${NC}"
curl -s http://localhost:9000/health | jq .

echo -e "${GREEN}Test complete!${NC}"