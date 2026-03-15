// storage.js — localStorage wrapper for tokens and cached data

const Storage = {
  _prefix: 'brain_',

  get(key) {
    try {
      const val = localStorage.getItem(this._prefix + key);
      return val ? JSON.parse(val) : null;
    } catch {
      return localStorage.getItem(this._prefix + key);
    }
  },

  set(key, value) {
    localStorage.setItem(this._prefix + key, JSON.stringify(value));
  },

  remove(key) {
    localStorage.removeItem(this._prefix + key);
  },

  // Config helpers
  getConfig() {
    return {
      githubToken: this.get('github_token'),
      claudeKey: this.get('claude_key'),
      repoOwner: this.get('repo_owner') || 'Annabetsy',
      repoName: this.get('repo_name') || 'brain',
    };
  },

  setConfig({ githubToken, claudeKey, repoOwner, repoName }) {
    if (githubToken) this.set('github_token', githubToken);
    if (claudeKey) this.set('claude_key', claudeKey);
    if (repoOwner) this.set('repo_owner', repoOwner);
    if (repoName) this.set('repo_name', repoName);
  },

  isConfigured() {
    const config = this.getConfig();
    return !!(config.githubToken && config.repoOwner && config.repoName);
  },

  // File cache (content + sha for conflict detection)
  cacheFile(path, content, sha) {
    this.set('file_' + path, { content, sha, ts: Date.now() });
  },

  getCachedFile(path) {
    return this.get('file_' + path);
  },
};
