const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const readline = require('readline');

class ProjectScanner {
  constructor(projectsPath) {
    this.projectsPath = projectsPath || path.join(process.env.HOME, '.claude', 'projects');
  }

  // Decode project directory name to original path
  decodeProjectPath(encodedName) {
    // Replace leading - with / and all - with /
    return encodedName.replace(/^-/, '/').replace(/-/g, '/');
  }

  // Get short project name (last path component)
  getProjectName(encodedName) {
    const decoded = this.decodeProjectPath(encodedName);
    return path.basename(decoded);
  }

  // Scan all projects
  async scanProjects() {
    try {
      const entries = await fsPromises.readdir(this.projectsPath, { withFileTypes: true });
      const projects = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== '.') {
          const projectPath = path.join(this.projectsPath, entry.name);
          const sessions = await this.scanSessions(projectPath);

          if (sessions.length > 0) {
            projects.push({
              id: entry.name,
              name: this.getProjectName(entry.name),
              path: this.decodeProjectPath(entry.name),
              sessionCount: sessions.length,
              latestSession: sessions[0]?.timestamp || null
            });
          }
        }
      }

      return projects.sort((a, b) =>
        new Date(b.latestSession || 0) - new Date(a.latestSession || 0)
      );
    } catch (err) {
      console.error('Error scanning projects:', err);
      return [];
    }
  }

  // Scan sessions in a project directory
  async scanSessions(projectPath) {
    try {
      const entries = await fsPromises.readdir(projectPath);
      const sessions = [];

      for (const entry of entries) {
        if (entry.endsWith('.jsonl')) {
          const sessionPath = path.join(projectPath, entry);
          const stats = await fsPromises.stat(sessionPath);
          const metadata = await this.extractSessionMetadata(sessionPath);

          sessions.push({
            id: path.basename(entry, '.jsonl'),
            filename: entry,
            path: sessionPath,
            size: stats.size,
            modified: stats.mtime,
            ...metadata
          });
        }
      }

      return sessions.sort((a, b) =>
        new Date(b.timestamp || b.modified) - new Date(a.timestamp || a.modified)
      );
    } catch (err) {
      console.error('Error scanning sessions:', err);
      return [];
    }
  }

  // Extract metadata from first few lines without reading entire file
  extractSessionMetadata(sessionPath) {
    return new Promise((resolve) => {
      const stream = fs.createReadStream(sessionPath);
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      let lineCount = 0;
      const metadata = {
        slug: null,
        sessionId: null,
        timestamp: null,
        gitBranch: null,
        version: null,
        firstMessage: null
      };

      rl.on('line', (line) => {
        lineCount++;
        if (lineCount > 20) {
          rl.close();
          stream.destroy();
          return;
        }

        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'user' && !metadata.sessionId) {
            metadata.sessionId = parsed.sessionId;
            metadata.slug = parsed.slug;
            metadata.timestamp = parsed.timestamp;
            metadata.gitBranch = parsed.gitBranch;
            metadata.version = parsed.version;

            // Extract first user message preview
            if (typeof parsed.message?.content === 'string') {
              metadata.firstMessage = parsed.message.content.slice(0, 300);
            } else if (Array.isArray(parsed.message?.content)) {
              const textBlock = parsed.message.content.find(b => b.type === 'text');
              if (textBlock) {
                metadata.firstMessage = textBlock.text.slice(0, 300);
              }
            }
          }
        } catch (e) { /* skip malformed lines */ }
      });

      rl.on('close', () => resolve(metadata));
      rl.on('error', () => resolve(metadata));
    });
  }
}

module.exports = ProjectScanner;
