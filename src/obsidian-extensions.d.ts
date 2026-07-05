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
 * Widened via Omit because obsidian ≥1.12 declares `activeEditor` itself, with
 * a narrower type than these non-standard contexts actually provide.
 */
export interface WorkspaceExt extends Omit<Workspace, 'activeEditor'> {
  activeEditor?: { editor?: Editor } | null;
}
