/**
 * Every workspace keyboard shortcut, in one table. The key parser, the
 * shortcuts dialog, and the key hints in tooltips all read it, so they cannot
 * disagree about which key does what.
 */
export const SHORTCUTS = [
  {
    label: 'Play or pause',
    bindings: [{ action: 'toggle-play', hint: 'Space', keys: [' '] }],
  },
  {
    label: 'Previous or next frame (chunk step while a probe is on the stage)',
    bindings: [
      { action: 'previous-frame', hint: '←', keys: ['ArrowLeft'], shift: false },
      { action: 'next-frame', hint: '→', keys: ['ArrowRight'], shift: false },
    ],
  },
  {
    label: 'Jump 10 frames or steps',
    bindings: [
      { action: 'back-10', hint: 'Shift+←', keys: ['ArrowLeft'], shift: true },
      { action: 'forward-10', hint: 'Shift+→', keys: ['ArrowRight'], shift: true },
    ],
  },
  {
    label: 'First or last frame or step',
    bindings: [
      { action: 'first-frame', hint: 'Home', keys: ['Home'] },
      { action: 'last-frame', hint: 'End', keys: ['End'] },
    ],
  },
  {
    label: 'Previous or next episode',
    bindings: [
      { action: 'previous-episode', hint: '[', keys: ['['] },
      { action: 'next-episode', hint: ']', keys: [']'] },
    ],
  },
  {
    label: 'Probe the policy at this frame',
    bindings: [{ action: 'probe', hint: 'I', keys: ['i', 'I'] }],
  },
  {
    label: 'Play or pause the selected chunk on the stage',
    bindings: [{ action: 'replay', hint: 'R', keys: ['r', 'R'] }],
  },
  {
    label: 'Remove the selected probe',
    bindings: [{ action: 'remove-probe', hint: 'Delete', keys: ['Delete', 'Backspace'] }],
  },
  {
    label: 'Show the recording on the stage, or close dialogs',
    bindings: [{ action: 'escape', hint: 'Esc', keys: ['Escape'] }],
  },
  {
    label: 'Show keyboard shortcuts',
    bindings: [{ action: 'help', hint: '?', keys: ['?'] }],
  },
] as const satisfies readonly ShortcutRow[]

/** One row of the shortcuts dialog. */
interface ShortcutRow {
  label: string
  bindings: readonly Binding[]
}

interface Binding {
  action: string
  /** The key as people see it, in the shortcuts dialog and tooltips. */
  hint: string
  /** `KeyboardEvent.key` values that trigger the action. */
  keys: readonly string[]
  /** Whether Shift must be held (true) or released (false); other bindings ignore Shift. */
  shift?: boolean
}

export type ShortcutAction = (typeof SHORTCUTS)[number]['bindings'][number]['action']

type ShortcutBinding = Binding & { action: ShortcutAction }

/** Every binding of the table, one per action. */
export const SHORTCUT_BINDINGS = SHORTCUTS.flatMap<ShortcutBinding>((row) => row.bindings)

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function shortcutForEvent(event: KeyboardEvent): ShortcutAction | null {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null
  const target = event.target
  if (target instanceof HTMLElement && (EDITABLE.has(target.tagName) || target.isContentEditable)) {
    return event.key === 'Escape' ? 'escape' : null
  }
  if (target instanceof HTMLButtonElement && (event.key === ' ' || event.key === 'Enter')) {
    // A button focused from the keyboard keeps its native activation keys.
    return null
  }
  const binding = SHORTCUT_BINDINGS.find(
    (candidate) =>
      candidate.keys.includes(event.key) &&
      (candidate.shift === undefined || candidate.shift === event.shiftKey),
  )
  return binding?.action ?? null
}

/** The key that triggers an action, as the shortcuts dialog shows it. */
export function shortcutHint(action: ShortcutAction): string {
  return SHORTCUT_BINDINGS.find((binding) => binding.action === action)?.hint ?? ''
}

/** A tooltip that names an action's key: `Play (Space)`. */
export function withShortcut(title: string, action: ShortcutAction): string {
  return `${title} (${shortcutHint(action)})`
}
