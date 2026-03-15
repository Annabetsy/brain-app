// markdown.js — Parse and render markdown with interactive checkboxes

const Markdown = {
  // Render markdown string to interactive HTML
  render(content, filePath) {
    const lines = content.split('\n');
    let html = '';
    let inTable = false;
    let tableHtml = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip HTML comments
      if (trimmed.match(/^<!--.*-->$/)) continue;
      // Strip inline comments for display
      const displayLine = line.replace(/\s*<!--.*?-->/g, '');

      // Blank line
      if (trimmed === '') {
        if (inTable) { html += tableHtml + '</table>'; inTable = false; tableHtml = ''; }
        continue;
      }

      // Table end detection
      if (inTable && !trimmed.startsWith('|')) {
        html += tableHtml + '</table>';
        inTable = false;
        tableHtml = '';
      }

      // Horizontal rule
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        html += '<hr>';
        continue;
      }

      // Headers
      const hMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
      if (hMatch) {
        const level = hMatch[1].length;
        const text = this._inline(hMatch[2]);
        html += `<h${level}>${text}</h${level}>`;
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('>')) {
        const text = this._inline(trimmed.slice(1).trim());
        html += `<blockquote>${text}</blockquote>`;
        continue;
      }

      // Table
      if (trimmed.startsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableHtml = '<table>';
        }
        // Skip separator row
        if (trimmed.match(/^\|[\s-:|]+\|$/)) continue;

        const cells = trimmed.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const isHeader = !tableHtml.includes('<td');
        const tag = isHeader && !tableHtml.includes('<tr>') ? 'th' : 'td';
        tableHtml += '<tr>' + cells.map(c => `<${tag}>${this._inline(c.trim())}</${tag}>`).join('') + '</tr>';
        continue;
      }

      // Checklist item (numbered or plain)
      const checkMatch = displayLine.match(/^(\d+\.\s*)?-\s*\[([ xX])\]\s*(.*)/);
      if (checkMatch) {
        const checked = checkMatch[2] !== ' ';
        const text = this._inline(checkMatch[3]);
        const number = checkMatch[1] ? checkMatch[1].replace(/\.\s*$/, '') : null;

        // Extract time estimate
        const timeMatch = checkMatch[3].match(/\(~[^)]+\)/);
        const timeStr = timeMatch ? timeMatch[0] : '';
        const taskText = timeStr ? text.replace(this._escapeRegex(timeStr), '').trim() : text;

        html += `<div class="checklist-item ${checked ? 'checked' : ''}" data-file="${filePath}" data-line="${i}">`;
        html += `<input type="checkbox" ${checked ? 'checked' : ''}>`;
        if (number) html += `<span class="checklist-number">${number}.</span>`;
        html += `<span class="checklist-text">${taskText}</span>`;
        if (timeStr) html += `<span class="checklist-time">${timeStr}</span>`;
        html += `</div>`;
        continue;
      }

      // Plain list item
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const text = this._inline(trimmed.slice(2));
        html += `<div style="padding:0.25rem 0;padding-left:1rem">&#x2022; ${text}</div>`;
        continue;
      }

      // Paragraph
      html += `<p>${this._inline(displayLine.trim())}</p>`;
    }

    if (inTable) html += tableHtml + '</table>';
    return html;
  },

  // Inline formatting
  _inline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
  },

  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  // Parse Claude's response for checklist items
  parseTaskList(text) {
    const tasks = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const match = line.match(/^-\s*\[[ xX]?\]\s*(.*)/);
      if (match) {
        tasks.push(match[1].trim());
      }
    }
    return tasks;
  },
};
