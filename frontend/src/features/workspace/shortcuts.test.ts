import { describe, expect, it } from 'vitest'

import { SHORTCUT_BINDINGS, shortcutForEvent, shortcutHint, withShortcut } from './shortcuts'

function key(key: string, init: KeyboardEventInit = {}, target?: EventTarget) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init })
  if (target) Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('shortcutForEvent', () => {
  it('maps keys to workspace actions', () => {
    expect(shortcutForEvent(key(' '))).toBe('toggle-play')
    expect(shortcutForEvent(key('ArrowLeft'))).toBe('previous-frame')
    expect(shortcutForEvent(key('ArrowRight'))).toBe('next-frame')
    expect(shortcutForEvent(key('ArrowLeft', { shiftKey: true }))).toBe('back-10')
    expect(shortcutForEvent(key('ArrowRight', { shiftKey: true }))).toBe('forward-10')
    expect(shortcutForEvent(key('Home'))).toBe('first-frame')
    expect(shortcutForEvent(key('End'))).toBe('last-frame')
    expect(shortcutForEvent(key('['))).toBe('previous-episode')
    expect(shortcutForEvent(key(']'))).toBe('next-episode')
    expect(shortcutForEvent(key('i'))).toBe('probe')
    expect(shortcutForEvent(key('I'))).toBe('probe')
    expect(shortcutForEvent(key('r'))).toBe('replay')
    expect(shortcutForEvent(key('R'))).toBe('replay')
    expect(shortcutForEvent(key('Delete'))).toBe('remove-probe')
    expect(shortcutForEvent(key('Backspace'))).toBe('remove-probe')
    expect(shortcutForEvent(key('Escape'))).toBe('escape')
    expect(shortcutForEvent(key('?'))).toBe('help')
    expect(shortcutForEvent(key('x'))).toBeNull()
  })

  it('leaves modified keys, form fields, and focused buttons alone', () => {
    expect(shortcutForEvent(key('i', { ctrlKey: true }))).toBeNull()
    expect(shortcutForEvent(key('i', { metaKey: true }))).toBeNull()

    const input = document.createElement('input')
    expect(shortcutForEvent(key('i', {}, input))).toBeNull()
    expect(shortcutForEvent(key('Escape', {}, input))).toBe('escape')

    const button = document.createElement('button')
    expect(shortcutForEvent(key(' ', {}, button))).toBeNull()
    expect(shortcutForEvent(key('Enter', {}, button))).toBeNull()
    expect(shortcutForEvent(key('ArrowRight', {}, button))).toBe('next-frame')

    const prevented = key('i')
    prevented.preventDefault()
    expect(shortcutForEvent(prevented)).toBeNull()
  })
})

describe('the shortcut table', () => {
  const bindings = SHORTCUT_BINDINGS

  it('binds each action once, with a hint, and never two actions to one key press', () => {
    const actions = bindings.map((binding) => binding.action)
    expect(new Set(actions).size).toBe(actions.length)
    for (const binding of bindings) expect(binding.hint).not.toBe('')

    const presses = bindings.flatMap((binding) =>
      binding.keys.flatMap((key) =>
        binding.shift === undefined
          ? [`${key}+shift`, key]
          : [binding.shift ? `${key}+shift` : key],
      ),
    )
    expect(new Set(presses).size).toBe(presses.length)
  })

  it('names keys for tooltips from the same table the parser reads', () => {
    expect(shortcutHint('toggle-play')).toBe('Space')
    expect(shortcutHint('back-10')).toBe('Shift+←')
    expect(withShortcut('Play chunk', 'replay')).toBe('Play chunk (R)')
    expect(shortcutForEvent(key(shortcutHint('next-episode')))).toBe('next-episode')
  })
})
