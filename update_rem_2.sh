#!/bin/bash
find src -type f -name "*.tsx" -exec sed -i 's/max-w-\[240px\]/max-w-\[15rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/min-h-\[36px\]/min-h-\[2.25rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/max-h-\[420px\]/max-h-\[26.25rem\]/g' {} +
