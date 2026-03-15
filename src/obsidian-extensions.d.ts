/**
 * Hackily exposes undocumented parts of the Obsidian implementation for our use.
 * Also extends some types to make our lives easier.
 */

import { Editor, Vault, Workspace } from 'obsidian';

export class VaultExt extends Vault {
  getConfig(key: string): unknown;
}

/**
 * Extended Workspace interface exposing `activeEditor` (available since Obsidian v1.x).
 * Supports Canvas text nodes, Lineage views, and other non-standard editor contexts.
 */
export interface WorkspaceExt extends Workspace {
  activeEditor?: { editor?: Editor } | null;
}
