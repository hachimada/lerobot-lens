import { fireEvent, render, renderHook } from '@testing-library/react'
import type { MouseEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { keepFocusOffButtons, shortcutForEvent, useKeyboardShortcuts } from './useKeyboardShortcuts'

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

describe('useKeyboardShortcuts', () => {
  it('dispatches actions with the latest handler and stops listening on unmount', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = renderHook(({ handler }) => useKeyboardShortcuts(handler), {
      initialProps: { handler: first },
    })
    fireEvent.keyDown(window, { key: 'i' })
    expect(first).toHaveBeenCalledWith('probe')

    rerender({ handler: second })
    fireEvent.keyDown(window, { key: ']' })
    fireEvent.keyDown(window, { key: 'q' })
    expect(second).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledWith('next-episode')

    unmount()
    fireEvent.keyDown(window, { key: 'i' })
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('ignores typing in text fields', () => {
    const handler = vi.fn()
    function Harness() {
      useKeyboardShortcuts(handler)
      return <input aria-label="field" />
    }
    const { getByLabelText } = render(<Harness />)
    fireEvent.keyDown(getByLabelText('field'), { key: 'i' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('stops listening while disabled, leaving keys to the page', () => {
    const handler = vi.fn()
    const { rerender } = renderHook(({ enabled }) => useKeyboardShortcuts(handler, enabled), {
      initialProps: { enabled: false },
    })
    const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true })
    window.dispatchEvent(space)
    expect(handler).not.toHaveBeenCalled()
    expect(space.defaultPrevented).toBe(false)
    rerender({ enabled: true })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    expect(handler).toHaveBeenCalledWith('toggle-play')
  })
})

describe('keepFocusOffButtons', () => {
  it('keeps clicked buttons from taking focus, and nothing else', () => {
    const container = document.createElement('div')
    container.innerHTML = '<button><span>Play</span></button><input />'
    const press = (target: Element) => {
      const preventDefault = vi.fn()
      keepFocusOffButtons({ target, preventDefault } as unknown as MouseEvent)
      return preventDefault.mock.calls.length > 0
    }
    expect(press(container.querySelector('span')!)).toBe(true)
    expect(press(container.querySelector('input')!)).toBe(false)
  })
})
