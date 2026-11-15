import { fireEvent, render, renderHook } from '@testing-library/react'
import type { MouseEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { keepFocusOffButtons, useKeyboardShortcuts } from './useKeyboardShortcuts'

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
