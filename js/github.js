// github.js — GitHub API wrapper for reading/writing markdown files

const GitHub = {
  _baseUrl: 'https://api.github.com',

  _headers() {
    const config = Storage.getConfig();
    return {
      'Authorization': `token ${config.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
    };
  },

  _repoPath() {
    const config = Storage.getConfig();
    return `${this._baseUrl}/repos/${config.repoOwner}/${config.repoName}`;
  },

  // Read a file from the repo. Returns { content, sha } or null on error.
  async readFile(path) {
    try {
      const resp = await fetch(`${this._repoPath()}/contents/${path}`, {
        headers: this._headers(),
      });
      if (!resp.ok) {
        if (resp.status === 404) return null;
        throw new Error(`GitHub API error: ${resp.status}`);
      }
      const data = await resp.json();
      const content = decodeURIComponent(escape(atob(data.content)));
      Storage.cacheFile(path, content, data.sha);
      return { content, sha: data.sha };
    } catch (err) {
      console.error('GitHub readFile error:', err);
      // Fall back to cache
      const cached = Storage.getCachedFile(path);
      if (cached) return { content: cached.content, sha: cached.sha, cached: true };
      throw err;
    }
  },

  // Write a file to the repo. Returns the new sha.
  async writeFile(path, content, message, sha) {
    const resp = await fetch(`${this._repoPath()}/contents/${path}`, {
      method: 'PUT',
      headers: {
        ...this._headers(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        content: btoa(unescape(encodeURIComponent(content))),
        sha,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      if (resp.status === 409) {
        throw new Error('CONFLICT: File was modified elsewhere. Please refresh and try again.');
      }
      throw new Error(`GitHub write error: ${err.message}`);
    }
    const data = await resp.json();
    const newSha = data.content.sha;
    Storage.cacheFile(path, content, newSha);
    return newSha;
  },

  // Toggle a checkbox line in a file. Returns updated content.
  async toggleCheckbox(path, lineIndex) {
    const file = await this.readFile(path);
    if (!file) throw new Error('File not found');

    const lines = file.content.split('\n');
    const line = lines[lineIndex];

    if (!line) throw new Error('Line not found');

    if (line.includes('- [ ]')) {
      lines[lineIndex] = line.replace('- [ ]', '- [x]');
    } else if (line.includes('- [x]')) {
      lines[lineIndex] = line.replace('- [x]', '- [ ]');
    } else {
      throw new Error('Not a checkbox line');
    }

    const taskText = line.replace(/^[\s\d.]*-\s*\[.\]\s*/, '').trim();
    const isChecking = line.includes('- [ ]');
    const newContent = lines.join('\n');
    const message = isChecking
      ? `Check off: ${taskText}`
      : `Uncheck: ${taskText}`;

    await this.writeFile(path, newContent, message, file.sha);
    return newContent;
  },

  // Add an item to a file at a specific section
  async addItem(path, item, sectionHeader) {
    const file = await this.readFile(path);
    if (!file) throw new Error('File not found');

    const lines = file.content.split('\n');
    const newLine = `- [ ] ${item}`;

    if (sectionHeader) {
      // Find the section and insert after its last checklist item
      let sectionStart = -1;
      let insertAt = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(sectionHeader)) {
          sectionStart = i;
        }
        if (sectionStart >= 0 && i > sectionStart) {
          // Keep going as long as we see checklist items or blank lines
          if (lines[i].match(/^- \[/) || lines[i].trim() === '') {
            insertAt = i + 1;
          } else if (lines[i].startsWith('#') || lines[i].startsWith('**') || lines[i].startsWith('---')) {
            // Hit next section — insert before it
            if (insertAt < 0) insertAt = i;
            break;
          }
        }
      }

      if (insertAt < 0) insertAt = lines.length;
      lines.splice(insertAt, 0, newLine);
    } else {
      // Append to end
      lines.push(newLine);
    }

    const newContent = lines.join('\n');
    await this.writeFile(path, newContent, `Add: ${item}`, file.sha);
    return newContent;
  },

  // Test the connection (returns user info or throws)
  async testConnection() {
    const resp = await fetch(`${this._baseUrl}/user`, {
      headers: this._headers(),
    });
    if (!resp.ok) throw new Error('Invalid GitHub token');
    return resp.json();
  },
};
