#!/usr/bin/env bash

echo "🚀 Setting up NMBL Vue Intellisense..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "tsconfig.json" ]; then
  echo "❌ Error: Run this script from the examples/vue directory"
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Build the Vue language plugin
echo "🔨 Building Vue language plugin..."
(cd ../../packages/vue-language-plugin-nmbl && bun run build)

# Build the parser
echo "🔨 Building NMBL parser..."
(cd ../../packages/parser && bun run build)

# Install VSCode extension locally
echo "🎨 Installing NMBL VSCode extension..."
(cd ../../packages/vscode-extension && bun run install-local)

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Open this folder in VSCode: code ."
echo "2. Install required extensions:"
echo "   - Vue - Official (Vue.volar)"
echo "   - TypeScript Vue Plugin (Vue.vscode-typescript-vue-plugin)"
echo "3. Select TypeScript version:"
echo "   - Cmd+Shift+P → 'TypeScript: Select TypeScript Version'"
echo "   - Choose 'Use Workspace Version'"
echo "4. Restart VSCode or reload window (Cmd+R / Ctrl+R)"
echo ""
echo "🧪 Test intellisense by opening src/App.vue"
echo ""
echo "For troubleshooting, see INTELLISENSE.md"