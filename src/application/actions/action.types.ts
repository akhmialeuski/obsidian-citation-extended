import type { ICitationService } from '../citation.service';
import type { IPlatformAdapter } from '../../platform/platform-adapter';
import type {
  INoteService,
  ILibraryService,
  ITemplateService,
} from '../../container';
import type { CitationsPluginSettings } from '../../ui/settings/settings';
import type { Entry } from '../../core';

/**
 * Dependencies available to every application action.
 * Replaces the old pattern of passing the entire CitationPlugin object.
 */
export interface ActionContext {
  readonly citationService: ICitationService;
  readonly platform: IPlatformAdapter;
  readonly noteService: INoteService;
  readonly libraryService: ILibraryService;
  readonly templateService: ITemplateService;
  readonly settings: CitationsPluginSettings;
}

/**
 * Declarative metadata describing an action — used by CommandRegistry
 * and ContextMenuHandler to build presentation surfaces automatically.
 */
export interface ActionDescriptor {
  /** Obsidian command ID — must match existing IDs to preserve hotkey bindings. */
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly showInCommandPalette: boolean;
  readonly showInContextMenu: boolean;
  readonly requiresEditor: boolean;
}

/**
 * Dynamic information provided at the moment an action is invoked.
 */
export interface ActionInvocationContext {
  citekey?: string;
  selectedText?: string;
  entry?: Entry;
  event?: MouseEvent | KeyboardEvent;
}

/**
 * Base class for all application actions.
 *
 * Actions are the single source of truth for plugin capabilities.
 * Both CommandRegistry and ContextMenuHandler read from the ActionRegistry
 * to build their respective UI surfaces — no manual registration needed.
 */
export abstract class ApplicationAction {
  abstract readonly descriptor: ActionDescriptor;

  constructor(protected ctx: ActionContext) {}

  /** Whether this action should appear in the given context. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isVisible(invocation: ActionInvocationContext): boolean {
    return true;
  }

  /** Whether this action is currently executable. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isEnabled(invocation: ActionInvocationContext): boolean {
    return true;
  }

  /** Execute the action directly (context menu, cursor command, etc.). */
  abstract execute(invocation: ActionInvocationContext): Promise<void>;
}

/**
 * An action that requires the user to search and select an entry
 * via the CitationSearchModal before executing.
 *
 * Extends ApplicationAction with modal-specific hooks.
 */
export abstract class SearchModalAction extends ApplicationAction {
  /** When true, the modal stays open after each selection (multi-select). */
  keepOpen?: boolean;

  /** Current selected text from the editor, injected before modal opens. */
  selectedText?: string;

  /** Called when the user selects an entry in the search modal. */
  abstract onChoose(
    item: Entry,
    evt: MouseEvent | KeyboardEvent,
  ): Promise<void> | void;

  /** Called when the modal is dismissed — for finalization (e.g. multi-select insert). */
  onClose?(): void;

  /** Keyboard shortcut instructions shown in the modal footer. */
  getInstructions?(): { command: string; purpose: string }[];

  /** Custom rendering for suggestion items (optional). */
  renderItem?(item: Entry, el: HTMLElement): void;
}
