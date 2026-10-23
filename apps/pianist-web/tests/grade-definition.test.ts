import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRADE_DEFINITION, GRADES, GRADE_IDS, LENGTHS, EXERCISES_PER_OPTION,
  OPTION_COUNT, TOTAL_EXERCISES, scoreIdentityMatches,
} from '../src/exercises/definition';
import { readSelection } from '../src/exercises/settings';

test('grade picker and edition inventory derive from the shared committed definition', () => {
  assert.equal(GRADE_DEFINITION.edition, 'authored-2026-10-22-v1');
  assert.deepEqual(GRADE_IDS, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(LENGTHS, ['n4', 'n6', 'n10', 'n20', 'n30', 'n50', 'n100']);
  assert.equal(EXERCISES_PER_OPTION, 100);
  assert.equal(OPTION_COUNT, 56);
  assert.equal(TOTAL_EXERCISES, 5600);
  for (const grade of GRADES) {
    assert.equal(readSelection({ grade: grade.id }).grade, grade.id);
    assert.ok(grade.title && grade.description && grade.topic && grade.validator);
  }
});

test('score identity belongs to its exact grade, length and committed quota', () => {
  assert.equal(scoreIdentityMatches('g8-n100-100', 8, 'n100'), true);
  for (const id of ['g1-n4-000', 'g1-n4-101', 'g1-n4-1', 'g2-n4-001', 'g1-n6-001'])
    assert.equal(scoreIdentityMatches(id, 1, 'n4'), false, id);
});
