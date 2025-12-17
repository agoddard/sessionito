const express = require('express');
const path = require('path');
const fs = require('fs');
const SessionReader = require('./src/services/sessionReader');
const ProjectScanner = require('./src/services/projectScanner');

const app = express();
const PORT = process.env.PORT || 3456;

const PROJECTS_PATH = path.join(process.env.HOME, '.claude', 'projects');
const sessionReader = new SessionReader(PROJECTS_PATH);
const projectScanner = new ProjectScanner(PROJECTS_PATH);

// Configure EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API: List all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await projectScanner.scanProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List sessions for a project
app.get('/api/projects/:projectId/sessions', async (req, res) => {
  try {
    const excludeAgents = req.query.excludeAgents === 'true';
    const projectPath = path.join(PROJECTS_PATH, req.params.projectId);
    let sessions = await projectScanner.scanSessions(projectPath);

    if (excludeAgents) {
      sessions = sessions.filter(s => !s.isAgentSession && !s.id?.startsWith('agent-'));
    }

    // Filter out empty/invalid sessions (0 messages, likely warmup or incomplete sessions)
    sessions = sessions.filter(s => s.userMessageCount > 0 || s.assistantMessageCount > 0);

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List all sessions (paginated)
app.get('/api/sessions', async (req, res) => {
  try {
    const excludeAgents = req.query.excludeAgents === 'true';
    const projects = await projectScanner.scanProjects();
    let allSessions = [];

    for (const project of projects) {
      const projectPath = path.join(PROJECTS_PATH, project.id);
      const sessions = await projectScanner.scanSessions(projectPath);
      for (const session of sessions) {
        allSessions.push({
          ...session,
          project: project.name,
          projectId: project.id,
          projectPath: project.path
        });
      }
    }

    // Filter out agent sessions if requested
    if (excludeAgents) {
      allSessions = allSessions.filter(s => !s.isAgentSession && !s.id?.startsWith('agent-'));
    }

    // Filter out empty/invalid sessions (0 messages, likely warmup or incomplete sessions)
    allSessions = allSessions.filter(s => s.userMessageCount > 0 || s.assistantMessageCount > 0);

    // Sort by timestamp
    allSessions.sort((a, b) =>
      new Date(b.timestamp || b.modified) - new Date(a.timestamp || a.modified)
    );

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const start = (page - 1) * limit;

    res.json({
      sessions: allSessions.slice(start, start + limit),
      total: allSessions.length,
      page,
      pages: Math.ceil(allSessions.length / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get single session content
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const projectId = req.query.project;

    let sessionPath;
    let projectInfo = null;

    if (projectId) {
      sessionPath = path.join(PROJECTS_PATH, projectId, `${sessionId}.jsonl`);
      projectInfo = {
        id: projectId,
        name: projectScanner.getProjectName(projectId),
        path: projectScanner.decodeProjectPath(projectId)
      };
    } else {
      // Search all projects for this session
      const found = await sessionReader.findSessionById(sessionId);
      if (found) {
        sessionPath = found.path;
        projectInfo = found.project;
      }
    }

    if (!sessionPath || !fs.existsSync(sessionPath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = await sessionReader.readSession(sessionPath);
    session.project = projectInfo;

    // Fallback to URL sessionId if session.id is null (empty/incomplete sessions)
    if (!session.id) {
      session.id = sessionId;
    }

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get parent session for an agent session
app.get('/api/sessions/:sessionId/parent', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const projectId = req.query.project;

    if (!projectId) {
      return res.status(400).json({ error: 'project parameter required' });
    }

    // Extract agentId from session filename (agent-{agentId}.jsonl)
    const agentIdMatch = sessionId.match(/^agent-(.+)$/);
    if (!agentIdMatch) {
      return res.json({ parent: null }); // Not an agent session
    }
    const agentId = agentIdMatch[1];

    const projectPath = path.join(PROJECTS_PATH, projectId);
    const readline = require('readline');

    // Scan all non-agent sessions in the project to find the parent
    const files = fs.readdirSync(projectPath).filter(f =>
      f.endsWith('.jsonl') && !f.startsWith('agent-')
    );

    for (const file of files) {
      const sessionPath = path.join(projectPath, file);
      const fileStream = fs.createReadStream(sessionPath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        if (line.includes(`"agentId":"${agentId}"`)) {
          const metadata = await projectScanner.extractSessionMetadata(sessionPath);
          rl.close();
          fileStream.destroy();
          return res.json({
            parent: {
              id: file.replace('.jsonl', ''),
              ...metadata,
              project: projectScanner.getProjectName(projectId),
              projectId
            }
          });
        }
      }
    }

    res.json({ parent: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get child agent sessions for a parent session
app.get('/api/sessions/:sessionId/children', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const projectId = req.query.project;

    if (!projectId) {
      return res.status(400).json({ error: 'project parameter required' });
    }

    const sessionPath = path.join(PROJECTS_PATH, projectId, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionPath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Read the session file and find all agentIds referenced in toolUseResult
    const readline = require('readline');
    const agentIds = new Set();

    const fileStream = fs.createReadStream(sessionPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          // Check for toolUseResult.agentId
          if (parsed.toolUseResult?.agentId) {
            agentIds.add(parsed.toolUseResult.agentId);
          }
        } catch (e) { /* skip malformed lines */ }
      }
    }

    // Look up the corresponding agent session files
    const projectPath = path.join(PROJECTS_PATH, projectId);
    const children = [];

    for (const agentId of agentIds) {
      const agentSessionPath = path.join(projectPath, `agent-${agentId}.jsonl`);
      if (fs.existsSync(agentSessionPath)) {
        const metadata = await projectScanner.extractSessionMetadata(agentSessionPath);
        children.push({
          id: `agent-${agentId}`,
          agentId,
          ...metadata,
          project: projectScanner.getProjectName(projectId),
          projectId
        });
      }
    }

    // Sort by timestamp
    children.sort((a, b) =>
      new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    );

    res.json({ children });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Search sessions
app.get('/api/search', async (req, res) => {
  const query = req.query.q?.toLowerCase();
  const excludeAgents = req.query.excludeAgents === 'true';

  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    const projects = await projectScanner.scanProjects();
    const results = [];

    for (const project of projects) {
      const projectPath = path.join(PROJECTS_PATH, project.id);
      const sessions = await projectScanner.scanSessions(projectPath);

      for (const session of sessions) {
        // Skip agent sessions if requested
        if (excludeAgents && (session.isAgentSession || session.id?.startsWith('agent-'))) {
          continue;
        }

        // Skip empty/invalid sessions (0 messages)
        if (session.userMessageCount === 0 && session.assistantMessageCount === 0) {
          continue;
        }

        // Search in slug, first message, and project name
        if (
          session.slug?.toLowerCase().includes(query) ||
          session.firstMessage?.toLowerCase().includes(query) ||
          project.name.toLowerCase().includes(query)
        ) {
          results.push({
            ...session,
            project: project.name,
            projectId: project.id
          });
        }
      }

      if (results.length >= 100) break;
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Page: Session browser (list)
app.get('/', async (req, res) => {
  res.render('index');
});

// Page: Single session viewer
app.get('/session/:sessionId', async (req, res) => {
  res.render('session', {
    sessionId: req.params.sessionId,
    projectId: req.query.project || ''
  });
});

app.listen(PORT, () => {
  console.log(`\n  Claude Session Viewer running at:`);
  console.log(`  http://localhost:${PORT}\n`);
});
