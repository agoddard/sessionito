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
    const projectPath = path.join(PROJECTS_PATH, req.params.projectId);
    const sessions = await projectScanner.scanSessions(projectPath);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List all sessions (paginated)
app.get('/api/sessions', async (req, res) => {
  try {
    const projects = await projectScanner.scanProjects();
    const allSessions = [];

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

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Search sessions
app.get('/api/search', async (req, res) => {
  const query = req.query.q?.toLowerCase();
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
