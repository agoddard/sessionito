// Session filtering - always hide agent sessions from flat list
// Agent sessions are only visible via parent expansion or hierarchy sidebar
const Settings = {
  filterSessions(sessions) {
    return sessions.filter(s => !s.isAgentSession && !s.id?.startsWith('agent-'));
  }
};
