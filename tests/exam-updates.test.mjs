import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseNotes, validateReleaseNotes} from '../scripts/check-release-notes.mjs';

test('published release history is valid and can supply the package version', () => {
  assert.equal(validateReleaseNotes(releaseNotes), releaseNotes);
});

test('release validation rejects impossible dates, duplicate versions and reversed history', () => {
  for (const date of ['2026-02-30', '2026-13-01', '2026/10/07']) {
    const notes = structuredClone(releaseNotes); notes[0].date = date;
    assert.throws(() => validateReleaseNotes(notes), /日期/);
  }
  const duplicate = structuredClone(releaseNotes); duplicate[1].version = duplicate[0].version;
  assert.throws(() => validateReleaseNotes(duplicate), /不可重复/);
  assert.throws(() => validateReleaseNotes([...releaseNotes].reverse()), /从新到旧/);
});

test('public copy rejects markup, corrupted text and unsupported categories before packaging', () => {
  for (const text of ['<img src=x onerror=alert(1)>', '更新??记录', '更新\uFFFD记录', '']) {
    const notes = structuredClone(releaseNotes); notes[0].changes[0].text = text;
    assert.throws(() => validateReleaseNotes(notes), /纯文本/);
  }
  const notes = structuredClone(releaseNotes); notes[0].changes[0].type = '内部';
  assert.throws(() => validateReleaseNotes(notes), /类型/);
  assert.throws(() => validateReleaseNotes([]), /至少需要/);
});
