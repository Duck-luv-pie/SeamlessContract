#!/bin/bash

# Setup script for connecting to GitHub repository "SeamlessContract"
# Usage: ./setup-github.sh YOUR_GITHUB_USERNAME

set -e

GITHUB_USERNAME=$1

if [ -z "$GITHUB_USERNAME" ]; then
    echo "❌ Error: GitHub username required"
    echo "Usage: ./setup-github.sh YOUR_GITHUB_USERNAME"
    echo ""
    echo "Example: ./setup-github.sh eric"
    exit 1
fi

REPO_NAME="SeamlessContract"
REPO_URL="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

echo "🚀 Setting up GitHub repository: ${REPO_NAME}"
echo ""

# Check if .git already exists
if [ -d ".git" ]; then
    echo "⚠️  Git repository already initialized"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    # Initialize git
    echo "📦 Initializing git repository..."
    git init
fi

# Check if remote already exists
if git remote get-url origin >/dev/null 2>&1; then
    echo "⚠️  Remote 'origin' already exists"
    echo "Current remote URL: $(git remote get-url origin)"
    read -p "Replace with ${REPO_URL}? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git remote remove origin
        git remote add origin "$REPO_URL"
        echo "✅ Remote updated"
    else
        echo "Using existing remote"
    fi
else
    # Add remote
    echo "🔗 Adding remote repository..."
    git remote add origin "$REPO_URL"
    echo "✅ Remote added: ${REPO_URL}"
fi

# Check if files are already committed
if [ -z "$(git status --porcelain)" ] && [ -n "$(git log 2>/dev/null)" ]; then
    echo "✅ All files already committed"
else
    # Stage all files
    echo "📝 Staging files..."
    git add .
    
    # Check what will be committed
    if [ -z "$(git status --porcelain)" ]; then
        echo "⚠️  No changes to commit"
    else
        # Commit
        echo "💾 Creating initial commit..."
        git commit -m "Initial commit: SeamlessContract escrow system with Kairo integration"
        echo "✅ Commit created"
    fi
fi

# Set branch to main
echo "🌿 Setting branch to main..."
git branch -M main 2>/dev/null || echo "Branch already main"

echo ""
echo "✅ Local setup complete!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Create the repository on GitHub:"
echo "   Visit: https://github.com/new"
echo "   Repository name: ${REPO_NAME}"
echo "   DO NOT initialize with README/.gitignore/license"
echo "   Click 'Create repository'"
echo ""
echo "2. Push to GitHub:"
echo "   git push -u origin main"
echo ""
echo "3. Or, if you've already created the repo, push now:"
read -p "Push to GitHub now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📤 Pushing to GitHub..."
    git push -u origin main
    echo ""
    echo "🎉 Success! Repository is now on GitHub:"
    echo "   ${REPO_URL}"
fi
