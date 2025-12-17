const fs = require('fs');
const readline = require('readline');
const path = require('path');

class SessionReader {
  constructor(projectsPath) {
    this.projectsPath = projectsPath || path.join(process.env.HOME, '.claude', 'projects');
  }

  // Parse a single session file
  async readSession(sessionPath) {
    const messages = [];
    const fileStream = fs.createReadStream(sessionPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          messages.push(parsed);
        } catch (e) {
          // Skip malformed lines
        }
      }
    }

    return this.processSession(messages);
  }

  // Process raw messages into conversation structure
  processSession(messages) {
    const session = {
      id: null,
      slug: null,
      metadata: {},
      conversation: []
    };

    for (const msg of messages) {
      // Skip file-history-snapshot
      if (msg.type === 'file-history-snapshot') continue;

      // Extract session metadata from first user message
      if (!session.id && msg.sessionId) {
        session.id = msg.sessionId;
        session.slug = msg.slug;
        session.metadata = {
          cwd: msg.cwd,
          gitBranch: msg.gitBranch,
          version: msg.version,
          startTime: msg.timestamp
        };
      }

      // Build conversation
      if (msg.type === 'user' || msg.type === 'assistant') {
        session.conversation.push(this.processMessage(msg));
      }
    }

    // Deduplicate assistant messages (they appear multiple times as content streams)
    session.conversation = this.deduplicateMessages(session.conversation);

    // Calculate session stats
    session.stats = this.calculateStats(session.conversation);

    return session;
  }

  // Process a single message
  processMessage(msg) {
    return {
      type: msg.type,
      uuid: msg.uuid,
      parentUuid: msg.parentUuid,
      timestamp: msg.timestamp,
      role: msg.message?.role,
      model: msg.message?.model,
      content: this.parseContent(msg.message?.content),
      usage: msg.message?.usage,
      stopReason: msg.message?.stop_reason,
      toolUseResult: msg.toolUseResult,
      thinkingMetadata: msg.thinkingMetadata,
      todos: msg.todos,
      isSidechain: msg.isSidechain
    };
  }

  // Parse content blocks
  parseContent(content) {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }
    if (Array.isArray(content)) {
      return content;
    }
    return [];
  }

  // Deduplicate streamed assistant messages
  deduplicateMessages(conversation) {
    const seen = new Map();
    const result = [];

    for (const msg of conversation) {
      if (msg.type === 'assistant' && msg.uuid) {
        const existing = seen.get(msg.uuid);
        if (existing) {
          // Keep the most complete version (more content blocks)
          if (msg.content.length > existing.content.length) {
            Object.assign(existing, msg);
          }
          continue;
        }
        seen.set(msg.uuid, msg);
      }
      result.push(msg);
    }

    return result;
  }

  // Calculate session statistics
  calculateStats(conversation) {
    let userMessages = 0;
    let assistantMessages = 0;
    let toolCalls = 0;
    let thinkingBlocks = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const msg of conversation) {
      if (msg.type === 'user') userMessages++;
      if (msg.type === 'assistant') {
        assistantMessages++;
        if (msg.usage) {
          totalInputTokens += msg.usage.input_tokens || 0;
          totalOutputTokens += msg.usage.output_tokens || 0;
        }
        for (const block of msg.content) {
          if (block.type === 'tool_use') toolCalls++;
          if (block.type === 'thinking') thinkingBlocks++;
        }
      }
    }

    return {
      userMessages,
      assistantMessages,
      toolCalls,
      thinkingBlocks,
      totalInputTokens,
      totalOutputTokens
    };
  }

  // Find session file by ID across all projects
  async findSessionById(sessionId) {
    const ProjectScanner = require('./projectScanner');
    const scanner = new ProjectScanner(this.projectsPath);
    const projects = await scanner.scanProjects();

    for (const project of projects) {
      const sessionPath = path.join(this.projectsPath, project.id, `${sessionId}.jsonl`);
      if (fs.existsSync(sessionPath)) {
        return {
          path: sessionPath,
          project: project
        };
      }
    }

    return null;
  }
}

module.exports = SessionReader;
