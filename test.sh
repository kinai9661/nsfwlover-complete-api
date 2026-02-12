#!/bin/bash
API="${1:-http://localhost:8787}"
echo "测试: $API"
curl -s "$API/health" | jq .
