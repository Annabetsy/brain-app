// app.js — Main app logic

const App = {
  currentTab: 'weekend',
  files: {},

  init() {
    if (Storage.isConfigured()) {
      this.showApp();
    } else {
      this.showSetup();
    }
    this.bindEvents();
  },

  // === Setup ===
  showSetup() {
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  showApp() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    this.loadFiles();
  },

  async handleSetup() {
    const btn = document.getElementById('setup-save');
    const errorEl = document.getElementById('setup-error');
    btn.disabled = true;
    btn.textContent = 'Connecting...';
    errorEl.classList.add('hidden');

    const githubToken = document.getElementById('github-token').value.trim();
    const claudeKey = document.getElementById('claude-key').value.trim();
    const repoOwner = document.getElementById('repo-owner').value.trim();
    const repoName = document.getElementById('repo-name').value.trim();

    if (!githubToken || !repoOwner || !repoName) {
      errorEl.textContent = 'GitHub token, username, and repo name are required.';
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Connect';
      return;
    }

    Storage.setConfig({ githubToken, claudeKey, repoOwner, repoName });

    try {
      await GitHub.testConnection();
      this.showApp();
    } catch (err) {
      errorEl.textContent = 'GitHub connection failed. Check your token and try again.';
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  },

  // === File Loading ===
  async loadFiles() {
    await Promise.all([
      this.loadFile('WEEKEND.md', 'weekend-content'),
      this.loadFile('COMMAND_CENTER.md', 'command-content'),
    ]);
  },

  async loadFile(path, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const file = await GitHub.readFile(path);
      if (!file) {
        container.innerHTML = `<p style="padding:1rem;color:var(--text-secondary)">No ${path} found yet. Run /weekend in Claude Code to create one!</p>`;
        return;
      }
      this.files[path] = file;
      container.innerHTML = Markdown.render(file.content, path);
      if (file.cached) this.toast('Showing cached version (offline)');
    } catch (err) {
      container.innerHTML = `<p class="error" style="padding:1rem">Error loading ${path}: ${err.message}</p>`;
    }
  },

  // === Tab Navigation ===
  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tabName}`));
  },

  // === Checkbox Toggle ===
  async handleCheckboxClick(el) {
    const file = el.dataset.file;
    const line = parseInt(el.dataset.line);
    const checkbox = el.querySelector('input[type="checkbox"]');

    // Optimistic update
    const wasChecked = checkbox.checked;
    checkbox.checked = !wasChecked;
    el.classList.toggle('checked');

    try {
      const newContent = await GitHub.toggleCheckbox(file, line);
      this.files[file] = { content: newContent, sha: Storage.getCachedFile(file)?.sha };
      this.toast(wasChecked ? 'Unchecked' : 'Done!');

      // Re-render to fix line numbers after change
      const containerId = file === 'WEEKEND.md' ? 'weekend-content' : 'command-content';
      document.getElementById(containerId).innerHTML = Markdown.render(newContent, file);
    } catch (err) {
      // Revert optimistic update
      checkbox.checked = wasChecked;
      el.classList.toggle('checked');

      if (err.message.includes('CONFLICT')) {
        this.toast('File changed — refreshing...');
        await this.loadFile(file, file === 'WEEKEND.md' ? 'weekend-content' : 'command-content');
      } else {
        this.toast('Error: ' + err.message);
      }
    }
  },

  // === Quick Add ===
  openQuickAdd() {
    document.getElementById('quick-add-modal').classList.remove('hidden');
    document.getElementById('quick-add-input').focus();
  },

  closeQuickAdd() {
    document.getElementById('quick-add-modal').classList.add('hidden');
    document.getElementById('quick-add-input').value = '';
  },

  async handleQuickAdd() {
    const input = document.getElementById('quick-add-input').value.trim();
    if (!input) return;

    const target = document.querySelector('.target-btn.active').dataset.target;
    const btn = document.getElementById('quick-add-save');
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
      if (target === 'weekend') {
        await GitHub.addItem('WEEKEND.md', input, '## Quick Wins');
        await this.loadFile('WEEKEND.md', 'weekend-content');
      } else {
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        await GitHub.addItem('COMMAND_CENTER.md', `${input}  <!-- ${timestamp} -->`, '## INBOX');
        await this.loadFile('COMMAND_CENTER.md', 'command-content');
      }
      this.toast('Added!');
      this.closeQuickAdd();
    } catch (err) {
      this.toast('Error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add';
    }
  },

  // === Room Scan ===
  openRoomScan() {
    document.getElementById('room-scan-modal').classList.remove('hidden');
    document.getElementById('photo-preview').classList.add('hidden');
    document.getElementById('scan-loading').classList.add('hidden');
    document.getElementById('scan-results').classList.add('hidden');
    document.getElementById('photo-input').value = '';
  },

  closeRoomScan() {
    document.getElementById('room-scan-modal').classList.add('hidden');
  },

  async handlePhotoSelected(file) {
    const preview = document.getElementById('photo-preview');
    const img = document.getElementById('photo-img');
    const loading = document.getElementById('scan-loading');
    const results = document.getElementById('scan-results');
    const tasksEl = document.getElementById('scan-tasks');

    // Show preview
    const reader = new FileReader();
    reader.onload = async (e) => {
      img.src = e.target.result;
      preview.classList.remove('hidden');
      loading.classList.remove('hidden');

      try {
        // Extract base64 data (remove data:image/...;base64, prefix)
        const base64 = e.target.result.split(',')[1];
        const mimeType = file.type || 'image/jpeg';

        const response = await Claude.roomScan(base64, mimeType);
        const tasks = Markdown.parseTaskList(response);

        if (tasks.length === 0) {
          tasksEl.innerHTML = '<p>No specific tasks found. Try a different angle or room?</p>';
        } else {
          tasksEl.innerHTML = tasks.map((task, i) =>
            `<div class="checklist-item" data-task-index="${i}">
              <input type="checkbox" checked>
              <span class="checklist-text">${task}</span>
            </div>`
          ).join('');
        }

        loading.classList.add('hidden');
        results.classList.remove('hidden');
      } catch (err) {
        loading.classList.add('hidden');
        tasksEl.innerHTML = `<p class="error">Error: ${err.message}</p>`;
        results.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);
  },

  async addScanTasks() {
    const items = document.querySelectorAll('#scan-tasks .checklist-item');
    const tasks = [];
    items.forEach(item => {
      if (item.querySelector('input').checked) {
        tasks.push(item.querySelector('.checklist-text').textContent);
      }
    });

    if (tasks.length === 0) {
      this.toast('No tasks selected');
      return;
    }

    const btn = document.getElementById('scan-add');
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
      // Add all tasks to WEEKEND.md under Home section
      const file = await GitHub.readFile('WEEKEND.md');
      if (!file) throw new Error('WEEKEND.md not found');

      const lines = file.content.split('\n');
      let insertAt = -1;

      // Find "## Home" section
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('## Home')) {
          insertAt = i + 1;
          // Skip existing items
          while (insertAt < lines.length && (lines[insertAt].match(/^- \[/) || lines[insertAt].trim() === '')) {
            insertAt++;
          }
          break;
        }
      }

      if (insertAt < 0) {
        // No Home section, find a good spot
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('## Family') || lines[i].startsWith('## Errands')) {
            insertAt = i;
            break;
          }
        }
        if (insertAt < 0) insertAt = lines.length;
        lines.splice(insertAt, 0, '', '## Home');
        insertAt += 2;
      }

      const newLines = tasks.map(t => `- [ ] ${t}`);
      lines.splice(insertAt, 0, ...newLines);

      const newContent = lines.join('\n');
      await GitHub.writeFile('WEEKEND.md', newContent, `Room scan: add ${tasks.length} tasks`, file.sha);
      await this.loadFile('WEEKEND.md', 'weekend-content');

      this.toast(`Added ${tasks.length} tasks!`);
      this.closeRoomScan();
    } catch (err) {
      this.toast('Error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Selected';
    }
  },

  // === AI Chat ===
  async handleAiSend() {
    const input = document.getElementById('ai-input');
    const chat = document.getElementById('ai-chat');
    const message = input.value.trim();
    if (!message) return;

    // Show user message
    chat.innerHTML += `<div class="ai-message user">${this._escapeHtml(message)}</div>`;
    input.value = '';
    chat.scrollTop = chat.scrollHeight;

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    chat.innerHTML += `<div class="ai-message assistant" id="${typingId}"><em>Thinking...</em></div>`;
    chat.scrollTop = chat.scrollHeight;

    try {
      // Provide context from weekend file
      let context = '';
      if (this.files['WEEKEND.md']) {
        context = 'Current weekend plan:\n' + this.files['WEEKEND.md'].content;
      }

      const response = await Claude.ask(message, context);
      const typingEl = document.getElementById(typingId);

      // Render response with interactive checkboxes
      const tasks = Markdown.parseTaskList(response);
      let responseHtml = this._escapeHtml(response).replace(/\n/g, '<br>');

      if (tasks.length > 0) {
        // Add "Add tasks" button
        responseHtml += `<br><button class="btn-primary btn-small" onclick="App.addAiTasks(${JSON.stringify(tasks)})">Add ${tasks.length} task${tasks.length > 1 ? 's' : ''} to Weekend</button>`;
      }

      typingEl.innerHTML = responseHtml;
      chat.scrollTop = chat.scrollHeight;
    } catch (err) {
      const typingEl = document.getElementById(typingId);
      typingEl.innerHTML = `<span class="error">Error: ${err.message}</span>`;
    }
  },

  async addAiTasks(tasks) {
    try {
      const file = await GitHub.readFile('WEEKEND.md');
      if (!file) throw new Error('WEEKEND.md not found');

      const lines = file.content.split('\n');
      // Add to Quick Wins section
      let insertAt = lines.length;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('## Quick Wins') || lines[i].includes('Quick Wins')) {
          insertAt = i + 1;
          while (insertAt < lines.length && (lines[insertAt].match(/^- \[/) || lines[insertAt].trim() === '')) {
            insertAt++;
          }
          break;
        }
      }

      const newLines = tasks.map(t => `- [ ] ${t}`);
      lines.splice(insertAt, 0, ...newLines);

      const newContent = lines.join('\n');
      await GitHub.writeFile('WEEKEND.md', newContent, `AI suggest: add ${tasks.length} tasks`, file.sha);
      await this.loadFile('WEEKEND.md', 'weekend-content');
      this.toast(`Added ${tasks.length} tasks!`);
    } catch (err) {
      this.toast('Error: ' + err.message);
    }
  },

  // === Refresh ===
  async refresh() {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('spinning');
    await this.loadFiles();
    btn.classList.remove('spinning');
    this.toast('Refreshed');
  },

  // === Settings ===
  openSettings() {
    const config = Storage.getConfig();
    document.getElementById('settings-github-token').value = config.githubToken || '';
    document.getElementById('settings-claude-key').value = config.claudeKey || '';
    document.getElementById('settings-modal').classList.remove('hidden');
  },

  closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
  },

  saveSettings() {
    const githubToken = document.getElementById('settings-github-token').value.trim();
    const claudeKey = document.getElementById('settings-claude-key').value.trim();
    Storage.setConfig({ githubToken, claudeKey });
    this.closeSettings();
    this.toast('Settings saved');
  },

  // === Toast ===
  toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.remove('hidden', 'fade-out');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => el.classList.add('hidden'), 300);
    }, 2000);
  },

  // === Helpers ===
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // === Event Binding ===
  bindEvents() {
    // Setup
    document.getElementById('setup-save').addEventListener('click', () => this.handleSetup());

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Checkbox clicks (delegated)
    document.addEventListener('click', (e) => {
      const item = e.target.closest('.checklist-item[data-file]');
      if (item) {
        e.preventDefault();
        this.handleCheckboxClick(item);
      }
    });

    // Quick Add
    document.getElementById('quick-add-fab').addEventListener('click', () => this.openQuickAdd());
    document.getElementById('quick-add-cancel').addEventListener('click', () => this.closeQuickAdd());
    document.getElementById('quick-add-save').addEventListener('click', () => this.handleQuickAdd());
    document.getElementById('quick-add-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleQuickAdd();
    });

    // Quick add target toggle
    document.querySelectorAll('.target-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Room Scan
    document.getElementById('room-scan-btn').addEventListener('click', () => this.openRoomScan());
    document.getElementById('scan-cancel').addEventListener('click', () => this.closeRoomScan());
    document.getElementById('scan-add').addEventListener('click', () => this.addScanTasks());
    document.getElementById('photo-input').addEventListener('change', (e) => {
      if (e.target.files[0]) this.handlePhotoSelected(e.target.files[0]);
    });

    // AI Chat
    document.getElementById('ai-send').addEventListener('click', () => this.handleAiSend());
    document.getElementById('ai-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleAiSend();
    });

    // Refresh
    document.getElementById('refresh-btn').addEventListener('click', () => this.refresh());

    // Settings
    document.getElementById('settings-btn').addEventListener('click', () => this.openSettings());
    document.getElementById('settings-cancel').addEventListener('click', () => this.closeSettings());
    document.getElementById('settings-save').addEventListener('click', () => this.saveSettings());

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });

    // Pull to refresh (simple implementation)
    let startY = 0;
    document.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; });
    document.addEventListener('touchend', (e) => {
      const endY = e.changedTouches[0].clientY;
      if (endY - startY > 100 && window.scrollY === 0) {
        this.refresh();
      }
    });
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
