#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Publishable packages, in dependency order (config first).
PACKAGES=(
  "packages/config"
  "packages/runtime"
  "packages/node"
  "packages/vite-plugin"
  "packages/next"
)

if [ -z "$1" ]; then
  echo -e "${RED}Error: Version type required${NC}"
  echo ""
  echo "Usage: pnpm release <patch|minor|major>"
  echo ""
  echo "  patch  # Bug fixes, docs (0.1.0 -> 0.1.1)"
  echo "  minor  # New features (0.1.0 -> 0.2.0)"
  echo "  major  # Breaking changes (0.1.0 -> 1.0.0)"
  exit 1
fi

VERSION_TYPE=$1
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Error: Invalid version type '$VERSION_TYPE'${NC}"
  echo "Must be one of: patch, minor, major"
  exit 1
fi

if [[ -n $(git status -s) ]]; then
  echo -e "${RED}Error: You have uncommitted changes${NC}"
  git status -s
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${YELLOW}Warning: You are on branch '$CURRENT_BRANCH', not 'main'${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo -e "${GREEN}Starting release...${NC}"

echo "Running tests..."
pnpm -r --filter './packages/*' run test

echo "Type checking..."
pnpm typecheck

echo "Building..."
pnpm build

# Single synced version, sourced from the config package.
CURRENT_VERSION=$(node -p "require('./packages/config/package.json').version")
echo "Current version: $CURRENT_VERSION"

case $VERSION_TYPE in
  patch) NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{$NF = $NF + 1;} 1' | sed 's/ /./g') ;;
  minor) NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{$(NF-1) = $(NF-1) + 1; $NF = 0;} 1' | sed 's/ /./g') ;;
  major) NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{$1 = $1 + 1; $2 = 0; $NF = 0;} 1' | sed 's/ /./g') ;;
esac

echo -e "${GREEN}Bumping all packages to $NEW_VERSION${NC}"

for pkg in "${PACKAGES[@]}"; do
  node -e "
    const fs = require('fs');
    const path = '$pkg/package.json';
    const json = JSON.parse(fs.readFileSync(path, 'utf8'));
    json.version = '$NEW_VERSION';
    fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  "
done
# Internal deps use workspace:^ — pnpm rewrites them to ^$NEW_VERSION on publish.

git add packages/*/package.json
git commit -m "chore: release v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo "Pushing commit..."
git push origin main
echo "Pushing tag..."
git push origin "v$NEW_VERSION"

echo ""
echo -e "${GREEN}✓ Release pushed.${NC} GitHub Actions will build + publish:"
for pkg in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$pkg/package.json').name")
  echo "  https://www.npmjs.com/package/$name"
done
