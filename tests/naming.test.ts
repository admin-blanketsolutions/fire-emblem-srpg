import { describe, expect, it } from 'vitest';
import { checkName, KEY_ROWS, keyLabel, NameEntry, NAME_MAX } from '../src/core/naming';

describe('names for the Recruit', () => {
  it('accepts a name of letters, spaces, hyphens, apostrophes and full stops, tidied', () => {
    expect(checkName('Hasan')).toEqual({ ok: true, name: 'Hasan' });
    expect(checkName("  Abd  al-Hakam ")).toEqual({ ok: true, name: 'Abd al-Hakam' });
    expect(checkName("Ma'mun")).toEqual({ ok: true, name: "Ma'mun" });
  });

  it.each([
    ['', /at least one letter/],
    ['   ', /at least one letter/],
    ['A'.repeat(NAME_MAX + 1), /at most/],
    ['1Hasan', /begins with a letter/],
    ['Ha$an', /begins with a letter/],
    ['Allah', /not a name for a soldier/],
    ['the Prophet', /not a name for a soldier/],
    ['محمد', /Latin letters/],
  ])('refuses %j', (name, reason) => {
    const check = checkName(name);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(reason);
  });

  it('lets Muhammad be a name: it is a common name, and means what it means anywhere', () => {
    expect(checkName('Muhammad').ok).toBe(true);
  });
});

describe('the on-screen keyboard', () => {
  const press = (e: NameEntry, row: number, col: number): string | null => {
    e.moveTo(row, col);
    return e.press();
  };

  it('has every letter of both cases, and Space, Del and Done', () => {
    const labels = KEY_ROWS.flat().map(keyLabel);
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') expect(labels).toContain(ch);
    for (const k of ['Space', 'Del', 'Done']) expect(labels).toContain(k);
  });

  it('types, deletes, and finishes with a name that will do', () => {
    const e = new NameEntry();
    press(e, 0, 7); // H
    press(e, 2, 0); // a
    press(e, 3, 5); // s
    press(e, 2, 0); // a
    press(e, 3, 0); // n
    expect(e.text).toBe('Hasan');
    e.delete();
    expect(e.text).toBe('Hasa');
    press(e, 3, 0);
    expect(press(e, 4, 5)).toBe('Hasan');
  });

  it('says why a name will not do, and keeps it', () => {
    const e = new NameEntry();
    expect(press(e, 4, 5)).toBeNull();
    expect(e.message).toMatch(/at least one letter/);
  });

  it('stops at the longest name, and wraps the cursor at the edges', () => {
    const e = new NameEntry('A'.repeat(NAME_MAX));
    press(e, 0, 0);
    expect(e.text).toHaveLength(NAME_MAX);
    expect(e.message).toMatch(/at most/);
    e.moveTo(0, 0);
    e.move('left');
    expect(e.col).toBe(KEY_ROWS[0]!.length - 1);
    e.move('up');
    expect(e.row).toBe(KEY_ROWS.length - 1);
    // a shorter row keeps the cursor on its last key
    expect(e.col).toBeLessThan(KEY_ROWS[4]!.length);
  });

  it('puts no space first or twice', () => {
    const e = new NameEntry();
    press(e, 4, 3);
    expect(e.text).toBe('');
    press(e, 0, 0);
    press(e, 4, 3);
    press(e, 4, 3);
    expect(e.text).toBe('A ');
  });
});
