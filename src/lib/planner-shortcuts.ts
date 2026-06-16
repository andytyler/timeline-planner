export type PlannerShortcutAction =
	| 'clear-selection'
	| 'copy-selection'
	| 'cut-selection'
	| 'delete-selection'
	| 'duplicate-selection'
	| 'focus-notes'
	| 'move-down'
	| 'move-left'
	| 'move-right'
	| 'move-up'
	| 'new-block'
	| 'paste-selection'
	| 'save-now'
	| 'select-down'
	| 'select-left'
	| 'select-right'
	| 'select-up'
	| 'show-shortcuts'
	| 'undo'
	| 'view-actual'
	| 'view-advertised'
	| 'view-combined'
	| 'zoom-in'
	| 'zoom-out';

export type PlannerShortcutIntent = {
	action: PlannerShortcutAction;
	step?: number;
};

type PlannerShortcut = {
	action: PlannerShortcutAction;
	allowInEditable?: boolean;
	ignoreShift?: boolean;
	key: string;
	meta?: boolean;
	shift?: boolean;
	step?: number;
};

export const plannerShortcuts: PlannerShortcut[] = [
	{ key: 'Escape', action: 'clear-selection', allowInEditable: true },
	{ key: '?', action: 'show-shortcuts', allowInEditable: true, ignoreShift: true },
	{ key: '/', action: 'show-shortcuts', meta: true, allowInEditable: true },
	{ key: 'z', action: 'undo', meta: true },
	{ key: 's', action: 'save-now', meta: true, allowInEditable: true },
	{ key: 'c', action: 'copy-selection', meta: true },
	{ key: 'x', action: 'cut-selection', meta: true },
	{ key: 'v', action: 'paste-selection', meta: true },
	{ key: 'n', action: 'new-block' },
	{ key: 'b', action: 'new-block' },
	{ key: '+', action: 'zoom-in', ignoreShift: true },
	{ key: '=', action: 'zoom-in', ignoreShift: true },
	{ key: '-', action: 'zoom-out', ignoreShift: true },
	{ key: '_', action: 'zoom-out', ignoreShift: true },
	{ key: '1', action: 'view-combined' },
	{ key: '2', action: 'view-advertised' },
	{ key: '3', action: 'view-actual' },
	{ key: 'ArrowUp', action: 'select-up' },
	{ key: 'ArrowDown', action: 'select-down' },
	{ key: 'ArrowLeft', action: 'select-left' },
	{ key: 'ArrowRight', action: 'select-right' },
	{ key: 'k', action: 'move-up', step: 5 },
	{ key: 'j', action: 'move-down', step: 5 },
	{ key: 'k', action: 'move-up', shift: true, step: 15 },
	{ key: 'j', action: 'move-down', shift: true, step: 15 },
	{ key: 'k', action: 'move-up', meta: true, step: 30 },
	{ key: 'j', action: 'move-down', meta: true, step: 30 },
	{ key: 'h', action: 'move-left' },
	{ key: 'l', action: 'move-right' },
	{ key: 'd', action: 'duplicate-selection', meta: true },
	{ key: 'Backspace', action: 'delete-selection' },
	{ key: 'Delete', action: 'delete-selection' },
	{ key: 'Enter', action: 'focus-notes' }
];

export function plannerShortcutForEvent(event: KeyboardEvent): PlannerShortcutIntent | null {
	const editable = isEditableTarget(event.target);
	const key = normalizedKey(event);
	const wantsMeta = event.metaKey || event.ctrlKey;

	const shortcut = plannerShortcuts.find(
		(candidate) =>
			candidate.key === key &&
			Boolean(candidate.meta) === wantsMeta &&
			(candidate.ignoreShift || Boolean(candidate.shift) === event.shiftKey) &&
			(candidate.allowInEditable || !editable) &&
			!event.altKey
	);

	if (!shortcut) return null;
	return { action: shortcut.action, step: shortcut.step };
}

function normalizedKey(event: KeyboardEvent) {
	if (event.key.length === 1) return event.key.toLowerCase();
	return event.key;
}

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof Element)) return false;
	return Boolean(target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'));
}
