import { App, Modal } from 'obsidian';
import { VariableDefinition } from '../../template/introspection.service';

/**
 * Modal that displays all available template variables for the current
 * library with a one-click "copy to clipboard" button.
 */
export class VariableListModal extends Modal {
  constructor(
    app: App,
    private variables: VariableDefinition[],
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('citation-variable-list-modal');

    contentEl.createEl('h2', { text: 'Available template variables' });

    const desc = contentEl.createEl('p', {
      cls: 'setting-item-description',
    });
    desc.setText(
      `Found ${this.variables.length} variables from your loaded library. Click "Copy all" to copy the list as Markdown.`,
    );

    const btnRow = contentEl.createDiv('citation-variable-btn-row');
    btnRow.setCssProps({
      display: 'flex',
      justifyContent: 'flex-end',
      marginBottom: '8px',
    });

    const copyBtn = btnRow.createEl('button', { text: 'Copy all' });
    copyBtn.addClass('mod-cta');
    copyBtn.addEventListener('click', () => {
      const md = this.formatAsMarkdown();
      void navigator.clipboard.writeText(md).then(() => {
        copyBtn.setText('Copied!');
        setTimeout(() => copyBtn.setText('Copy all'), 1500);
      });
    });

    const table = contentEl.createEl('table');
    table.setCssProps({ width: '100%', fontSize: '0.85em' });

    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: 'Variable' });
    headerRow.createEl('th', { text: 'Description' });
    headerRow.createEl('th', { text: 'Example' });

    const tbody = table.createEl('tbody');
    for (const v of this.variables) {
      const row = tbody.createEl('tr');

      const codeCell = row.createEl('td');
      codeCell.createEl('code', { text: `{{${v.key}}}` });

      row.createEl('td', { text: v.description || '—' });

      const exCell = row.createEl('td');
      if (v.example) {
        exCell.createEl('code', { text: v.example });
      } else {
        exCell.setText('—');
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private formatAsMarkdown(): string {
    const lines = [
      '| Variable | Description | Example |',
      '|----------|-------------|---------|',
    ];
    for (const v of this.variables) {
      const ex = v.example ? `\`${v.example}\`` : '—';
      lines.push(`| \`{{${v.key}}}\` | ${v.description || '—'} | ${ex} |`);
    }
    return lines.join('\n');
  }
}
