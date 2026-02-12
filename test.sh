#!/bin/bash
read -p "Worker URL: " URL
echo "测试健康检查..."
curl "$URL/health"
