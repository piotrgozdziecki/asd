#!/bin/bash

# Zastąpienie sztywnych pikseli w wartościach arbitralnych Tailwind na rem
find src -type f -name "*.tsx" -exec sed -i 's/text-\[9px\]/text-\[0.5625rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/text-\[10px\]/text-\[0.625rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/text-\[11px\]/text-\[0.6875rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/min-h-\[38px\]/min-h-\[2.375rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/min-h-\[44px\]/min-h-\[2.75rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/min-h-\[52px\]/min-h-\[3.25rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/max-w-\[140px\]/max-w-\[8.75rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/max-w-\[180px\]/max-w-\[11.25rem\]/g' {} +
find src -type f -name "*.tsx" -exec sed -i 's/max-w-\[200px\]/max-w-\[12.5rem\]/g' {} +

