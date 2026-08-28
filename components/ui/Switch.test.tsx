// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import Switch from './Switch';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(ui); });
  return container.querySelector('button') as HTMLButtonElement;
}

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  if (container) container.remove();
  container = null;
  root = null;
});

describe('Switch', () => {
  it('renders unchecked with role=switch and aria-checked=false', () => {
    const button = render(<Switch checked={false} onChange={() => {}} />);
    expect(button.getAttribute('role')).toBe('switch');
    expect(button.getAttribute('aria-checked')).toBe('false');
  });

  it('renders checked with aria-checked=true', () => {
    const button = render(<Switch checked={true} onChange={() => {}} />);
    expect(button.getAttribute('aria-checked')).toBe('true');
  });

  it('exposes an accessible name via ariaLabel', () => {
    const button = render(<Switch checked={false} onChange={() => {}} ariaLabel="Face ID" />);
    expect(button.getAttribute('aria-label')).toBe('Face ID');
  });

  it('exposes an accessible name via ariaLabelledBy', () => {
    const button = render(<Switch checked={false} onChange={() => {}} ariaLabelledBy="row-label-1" />);
    expect(button.getAttribute('aria-labelledby')).toBe('row-label-1');
  });

  it('calls onChange when clicked', () => {
    const onChange = vi.fn();
    const button = render(<Switch checked={false} onChange={onChange} />);
    act(() => { button.click(); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not call onChange when disabled and clicked', () => {
    const onChange = vi.fn();
    const button = render(<Switch checked={false} onChange={onChange} disabled />);
    act(() => { button.click(); });
    expect(onChange).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
  });

  it('renders a native <button>, so Enter/Space activation and Tab reachability are guaranteed by HTML semantics', () => {
    // jsdom does not simulate the browser's native "Enter/Space on a focused
    // button dispatches click" behavior from synthetic KeyboardEvents, so that
    // exact interaction can't be asserted here. What's verifiable with the
    // current test infrastructure: the control is a real, non-disabled
    // <button> (native keyboard operability) and it accepts programmatic
    // focus (not removed from the tab order).
    const button = render(<Switch checked={false} onChange={() => {}} />);
    expect(button.tagName).toBe('BUTTON');
    act(() => { button.focus(); });
    expect(document.activeElement).toBe(button);
  });

  it('removes focusability when disabled, per native <button disabled> semantics', () => {
    const button = render(<Switch checked={false} onChange={() => {}} disabled />);
    act(() => { button.focus(); });
    expect(document.activeElement).not.toBe(button);
  });

  it('meets the 44x44 minimum interaction target without enlarging the visible track', () => {
    const button = render(<Switch checked={false} onChange={() => {}} />);
    expect(button.style.width).toBe('44px');
    expect(button.style.height).toBe('44px');
    const track = button.firstElementChild as HTMLElement;
    expect(track.style.width).toBe('42px');
    expect(track.style.height).toBe('24px');
  });
});
