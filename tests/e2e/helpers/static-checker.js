/**
 * QuizFocus Static Code & Asset Checker
 * Inspects CSS tokens, component styles, package.json configs, and deployment manifests.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const PATHS = {
  root: PROJECT_ROOT,
  desktopWeb: path.join(PROJECT_ROOT, 'apps/desktop-web'),
  indexCss: path.join(PROJECT_ROOT, 'apps/desktop-web/src/index.css'),
  sidebarCss: path.join(PROJECT_ROOT, 'apps/desktop-web/src/components/layout/Sidebar.css'),
  aiWorkspace: path.join(PROJECT_ROOT, 'apps/desktop-web/src/components/platform/ai/AIWorkspace.jsx'),
  navigatorSidebar: path.join(PROJECT_ROOT, 'apps/desktop-web/src/components/platform/navigator/NavigatorSidebar.jsx'),
  settingsDrawer: path.join(PROJECT_ROOT, 'apps/desktop-web/src/components/platform/settings/SettingsDrawer.jsx'),
  activitySettings: path.join(PROJECT_ROOT, 'apps/desktop-web/src/pages/Settings/components/ActivitySettings.jsx'),
  helpSettings: path.join(PROJECT_ROOT, 'apps/desktop-web/src/pages/Settings/components/HelpSettings.jsx'),
  publicProfile: path.join(PROJECT_ROOT, 'apps/desktop-web/src/pages/Profile/PublicProfile.jsx'),
  challengesPage: path.join(PROJECT_ROOT, 'apps/desktop-web/src/pages/Challenges/Challenges.jsx'),
  vercelJson: path.join(PROJECT_ROOT, 'apps/desktop-web/vercel.json'),
  desktopWebPackageJson: path.join(PROJECT_ROOT, 'apps/desktop-web/package.json'),
  rootPackageJson: path.join(PROJECT_ROOT, 'package.json'),
  services: path.join(PROJECT_ROOT, 'services'),
};

export function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

export function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getAllFilesWithExt(dir, ext = '.css', excludeList = ['node_modules', 'dist', '.git']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function traverse(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (excludeList.includes(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
  }

  traverse(dir);
  return results;
}

/**
 * Extracts all hex colors from a string (e.g. #FF4500, #121214).
 */
export function extractHexColors(content) {
  const hexRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  const matches = content.match(hexRegex) || [];
  return [...new Set(matches.map(h => h.toUpperCase()))];
}
