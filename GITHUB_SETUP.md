# Setting Up GitHub Repository: SeamlessContract

## Step-by-Step Guide

### Step 1: Create GitHub Repository (via Web)

1. **Go to GitHub:**
   - Visit https://github.com/new
   - Or click the "+" icon → "New repository"

2. **Repository Settings:**
   - **Repository name:** `SeamlessContract`
   - **Description:** `Smart contract escrow system with Kairo AI Sec integration`
   - **Visibility:** Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
   - Click "Create repository"

3. **Copy the repository URL:**
   - After creating, you'll see a page with setup instructions
   - Copy the repository URL (e.g., `https://github.com/yourusername/SeamlessContract.git`)
   - Or use SSH: `git@github.com:yourusername/SeamlessContract.git`

### Step 2: Initialize Git Locally

Run these commands in your terminal (in the `/Users/eric/scontract` directory):

```bash
# Initialize git repository
git init

# Add all files (respects .gitignore)
git add .

# Create initial commit
git commit -m "Initial commit: SeamlessContract escrow system with Kairo integration"

# Rename default branch to main (if needed)
git branch -M main

# Add remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/SeamlessContract.git

# Push to GitHub
git push -u origin main
```

### Step 3: Verify

After pushing, verify on GitHub:
- Go to https://github.com/YOUR_USERNAME/SeamlessContract
- You should see all your files
- Check that `.env` and `errors` files are NOT visible (they're in .gitignore)

## Quick Command Reference

```bash
# Full sequence (after creating repo on GitHub):
cd /Users/eric/scontract
git init
git add .
git commit -m "Initial commit: SeamlessContract escrow system"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/SeamlessContract.git
git push -u origin main
```

## Troubleshooting

### If you get "repository already exists" error:
- The remote is already added. Remove it first:
  ```bash
  git remote remove origin
  git remote add origin https://github.com/YOUR_USERNAME/SeamlessContract.git
  ```

### If you need to use SSH instead of HTTPS:
```bash
git remote set-url origin git@github.com:YOUR_USERNAME/SeamlessContract.git
```

### If authentication fails:
- For HTTPS: GitHub may ask for Personal Access Token instead of password
- For SSH: Make sure you've added your SSH key to GitHub

## What Gets Pushed

✅ **Will be pushed:**
- All source code (`contracts/`, `api/`, `test/`, `scripts/`)
- Configuration files (`package.json`, `hardhat.config.js`, `render.yaml`, `Procfile`)
- Documentation (`README.md`, `DEPLOYMENT.md`, etc.)
- `.gitignore` file

❌ **Will NOT be pushed** (thanks to `.gitignore`):
- `.env` (secrets)
- `errors` (error logs)
- `node_modules/` (dependencies)
- `artifacts/` (compiled contracts)
- `cache/` (Hardhat cache)
- `*.log` and `*.pid` files

## Next Steps After Push

1. **Set up GitHub Secrets** (for CI/CD):
   - Go to Settings → Secrets and variables → Actions
   - Add `KAIRO_API_KEY` secret

2. **Verify GitHub Actions:**
   - Check that `.github/workflows/kairo-security.yml` is pushed
   - Actions will run on pull requests

3. **Deploy to Render:**
   - Follow instructions in `DEPLOYMENT.md`
   - Connect your GitHub repo to Render
   - Set environment variables in Render dashboard
