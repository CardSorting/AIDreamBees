#!/bin/bash

# --- Production Hardened Soketi Launcher ---

echo "--- Soketi Production Node Initializing ---"

# Check if soketi is installed
if ! command -v soketi &> /dev/null
then
    echo "Installing Soketi globally..."
    npm install -g @soketi/soketi
fi

# Run soketi with hardened settings
# In production, you would add --debug to see real-time packet info
# Or use environment variables for keys
echo "Launching WebSocket Server on port 6001..."
soketi start \
  --port=6001 \
  --appId=${SOKETI_APP_ID:-app-id} \
  --key=${SOKETI_APP_KEY:-app-key} \
  --secret=${SOKETI_APP_SECRET:-app-secret} \
  --enable-metrics=true
