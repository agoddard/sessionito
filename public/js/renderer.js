class MessageRenderer {
  constructor() {
    // Configure marked for code highlighting
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  // Determine the display type for a message (for chat-like layout)
  getMessageDisplayType(message) {
    if (message.type === 'assistant') {
      // Check if message only contains thinking and/or tool_use blocks (no text)
      const hasOnlyToolContent = message.content &&
        message.content.length > 0 &&
        message.content.every(block => block.type === 'thinking' || block.type === 'tool_use');

      return hasOnlyToolContent ? 'tool-only' : 'assistant';
    }

    if (message.type === 'user') {
      // Check if ALL content blocks are tool_result
      const hasOnlyToolResults = message.content &&
        message.content.length > 0 &&
        message.content.every(block => block.type === 'tool_result');

      return hasOnlyToolResults ? 'tool-result-only' : 'user-input';
    }

    return message.type;
  }

  // Tool icons
  getToolIcon(toolName) {
    const icons = {
      'Read': '📖',
      'Write': '✏️',
      'Edit': '🔧',
      'Bash': '💻',
      'Grep': '🔍',
      'Glob': '📁',
      'Task': '📋',
      'WebFetch': '🌐',
      'WebSearch': '🔎',
      'TodoWrite': '✅',
      'AskUserQuestion': '❓',
      'NotebookEdit': '📓',
      'LS': '📂'
    };
    return icons[toolName] || '🔧';
  }

  // Render a full message
  renderMessage(message) {
    const displayType = this.getMessageDisplayType(message);
    const container = document.createElement('div');
    container.className = `message message-${message.type} message-display-${displayType}`;
    container.dataset.uuid = message.uuid || '';

    // Only add header for non-compact messages
    if (displayType !== 'tool-result-only' && displayType !== 'tool-only') {
      container.appendChild(this.renderHeader(message));
    }

    // Content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content';

    // Render content blocks
    if (message.content && message.content.length > 0) {
      for (const block of message.content) {
        contentWrapper.appendChild(this.renderBlock(block));
      }
    }

    // Render todos if present
    if (message.todos && message.todos.length > 0) {
      contentWrapper.appendChild(this.renderTodos(message.todos));
    }

    container.appendChild(contentWrapper);

    return container;
  }

  // Render todos as checkboxes
  renderTodos(todos) {
    const container = document.createElement('div');
    container.className = 'content-block todos-block';

    const list = document.createElement('ul');
    list.className = 'todos-list';

    for (const todo of todos) {
      const item = document.createElement('li');
      item.className = `todo-item todo-${todo.status}`;

      const checkbox = document.createElement('span');
      checkbox.className = 'todo-checkbox';

      const content = document.createElement('span');
      content.className = 'todo-content';
      content.textContent = todo.content;

      item.appendChild(checkbox);
      item.appendChild(content);
      list.appendChild(item);
    }

    container.appendChild(list);
    return container;
  }

  // Render message header
  renderHeader(message) {
    const header = document.createElement('div');
    header.className = 'message-header';

    const role = document.createElement('span');
    role.className = 'message-role';
    role.textContent = message.type === 'user' ? 'User' : 'Assistant';

    const meta = document.createElement('span');
    meta.className = 'message-meta';

    const time = message.timestamp
      ? new Date(message.timestamp).toLocaleTimeString()
      : '';

    let metaHtml = time ? `<time>${time}</time>` : '';
    if (message.model) {
      const shortModel = message.model.replace('claude-', '').replace('-20251101', '').replace('-20250929', '');
      metaHtml += `<span class="model">${shortModel}</span>`;
    }
    meta.innerHTML = metaHtml;

    header.appendChild(role);
    header.appendChild(meta);
    return header;
  }

  // Render a single content block
  renderBlock(block) {
    switch (block.type) {
      case 'text':
        return this.renderTextBlock(block);
      case 'thinking':
        return this.renderThinkingBlock(block);
      case 'tool_use':
        return this.renderToolUseBlock(block);
      case 'tool_result':
        return this.renderToolResultBlock(block);
      default:
        return this.renderUnknownBlock(block);
    }
  }

  // Render text block with markdown
  renderTextBlock(block) {
    const div = document.createElement('div');
    div.className = 'content-block text-block';

    try {
      div.innerHTML = marked.parse(block.text || '');
    } catch (e) {
      div.textContent = block.text || '';
    }

    return div;
  }

  // Render thinking block (collapsible)
  renderThinkingBlock(block) {
    const details = document.createElement('details');
    details.className = 'content-block thinking-block';

    const summary = document.createElement('summary');
    const thinkingPreview = (block.thinking || '').slice(0, 100);
    summary.innerHTML = `<span class="thinking-icon">💭</span> Thinking... <span class="thinking-preview">${this.escapeHtml(thinkingPreview)}...</span>`;

    const content = document.createElement('div');
    content.className = 'thinking-content';
    content.textContent = block.thinking || '';

    details.appendChild(summary);
    details.appendChild(content);
    return details;
  }

  // Render tool use block
  renderToolUseBlock(block) {
    // Special handling for TodoWrite - render as checkbox list
    if (block.name === 'TodoWrite' && block.input?.todos) {
      return this.renderTodos(block.input.todos);
    }

    const details = document.createElement('details');
    details.className = 'content-block tool-use-block';
    details.open = false;

    const summary = document.createElement('summary');
    summary.className = 'tool-header';

    // Create a preview of the tool input
    let inputPreview = '';
    if (block.input) {
      if (block.name === 'Bash' && block.input.command) {
        inputPreview = block.input.command.slice(0, 60);
      } else if (block.name === 'Read' && block.input.file_path) {
        inputPreview = block.input.file_path;
      } else if (block.name === 'Grep' && block.input.pattern) {
        inputPreview = `"${block.input.pattern}"`;
      } else if (block.name === 'Edit' && block.input.file_path) {
        inputPreview = block.input.file_path;
      } else if (block.name === 'Write' && block.input.file_path) {
        inputPreview = block.input.file_path;
      } else if (block.name === 'Glob' && block.input.pattern) {
        inputPreview = block.input.pattern;
      }
    }

    summary.innerHTML = `
      <span class="tool-icon">${this.getToolIcon(block.name)}</span>
      <span class="tool-name">${block.name}</span>
      ${inputPreview ? `<span class="tool-preview">${this.escapeHtml(inputPreview)}</span>` : ''}
    `;

    // Add "Open" button for Write tool with previewable files
    if (block.name === 'Write' && block.input?.file_path) {
      const filePath = block.input.file_path;
      const ext = filePath.split('.').pop()?.toLowerCase();
      const previewableExtensions = ['html', 'htm', 'css', 'js', 'json', 'txt', 'md', 'svg'];

      if (previewableExtensions.includes(ext)) {
        const fileName = filePath.split('/').pop();
        const openBtn = document.createElement('button');
        openBtn.className = 'open-file-btn';
        openBtn.textContent = `Open ${fileName}`;
        openBtn.onclick = (e) => {
          e.stopPropagation();
          if (typeof openFilePreview === 'function') {
            openFilePreview(filePath);
          }
        };
        summary.appendChild(openBtn);
      }
    }

    const inputDiv = document.createElement('div');
    inputDiv.className = 'tool-input';

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-json';
    code.textContent = JSON.stringify(block.input, null, 2);
    pre.appendChild(code);
    inputDiv.appendChild(pre);

    details.appendChild(summary);
    details.appendChild(inputDiv);
    return details;
  }

  // Check if text looks like line-numbered file content (cat -n format)
  hasLineNumbers(text) {
    // Check if first few lines match the pattern "  <number>→"
    const lines = text.split('\n').slice(0, 3);
    return lines.some(line => /^\s*\d+→/.test(line));
  }

  // Render tool result block
  renderToolResultBlock(block) {
    const details = document.createElement('details');
    details.className = 'content-block tool-result-block';
    details.open = false;

    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="result-icon">📤</span> Tool Result`;

    const content = document.createElement('div');
    content.className = 'tool-result-content';

    if (Array.isArray(block.content)) {
      for (const item of block.content) {
        if (item.type === 'text') {
          const text = item.text || '';

          // If content has line numbers, render as pre with non-selectable line numbers
          if (this.hasLineNumbers(text)) {
            const pre = document.createElement('pre');
            pre.innerHTML = this.wrapLineNumbers(this.escapeHtml(text));
            content.appendChild(pre);
          } else {
            // Otherwise render as markdown
            const div = document.createElement('div');
            div.className = 'tool-result-text';
            try {
              div.innerHTML = marked.parse(text);
            } catch (e) {
              const pre = document.createElement('pre');
              pre.textContent = text;
              div.appendChild(pre);
            }
            content.appendChild(div);
          }
        }
      }
    } else if (typeof block.content === 'string') {
      const text = block.content;

      if (this.hasLineNumbers(text)) {
        const pre = document.createElement('pre');
        pre.innerHTML = this.wrapLineNumbers(this.escapeHtml(text));
        content.appendChild(pre);
      } else {
        const div = document.createElement('div');
        div.className = 'tool-result-text';
        try {
          div.innerHTML = marked.parse(text);
        } catch (e) {
          const pre = document.createElement('pre');
          pre.textContent = text;
          div.appendChild(pre);
        }
        content.appendChild(div);
      }
    }

    details.appendChild(summary);
    details.appendChild(content);
    return details;
  }

  // Render unknown block type
  renderUnknownBlock(block) {
    const div = document.createElement('div');
    div.className = 'content-block unknown-block';

    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(block, null, 2);
    div.appendChild(pre);

    return div;
  }

  // Escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Wrap line numbers in non-selectable spans for code content
  // Detects cat -n style output (e.g., "     1→" or "    12→")
  wrapLineNumbers(text) {
    // Pattern matches line numbers at start of lines (spaces + digits + arrow)
    const lineNumberPattern = /^(\s*\d+→)/gm;
    return text.replace(lineNumberPattern, '<span class="line-number">$1</span>');
  }
}
