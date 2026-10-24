import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from '../src/shared/search';
import { matchesBundledWork } from '../src/platform/bundled-library';
import { parseMeasureRange } from '../src/practice/measure-range';

test('Vietnamese titles match with accents, without accents, decomposed marks and Đ', () => {
  for (const [title, query] of [['Tràn bộ nhớ', 'tran bo nho'], ['Tình Đơn Phương', 'TINH DON PHUONG'],
    ['Đường về', 'duong'], ['Em ơi Hà Nội phố', '  em oi  ha noi '], ['Tình Đơn Phương'.normalize('NFD'), 'đơn phương']]) {
    assert.equal(matchesSearch(title, query), true, title + ': ' + query);
  }
  assert.equal(matchesSearch('Tình Đơn Phương', 'Tràn bộ nhớ'), false);
  assert.equal(matchesSearch('Tràn bộ nhớ', '  '), true);
  assert.equal(matchesBundledWork({id:'a',title:'Bài chính',versions:[{id:'b',title:'Đường về',versionLabel:'Bản dễ',composer:'Đỗ',filename:'b.mxl',sha256:'',bytes:1,url:''}]}, 'ban de'), true);
});
test('manual range validates both endpoints together without moving the other endpoint', () => {
  assert.deepEqual(parseMeasureRange('12', '20', 57), {fromMeasure:11,toMeasure:19});
  assert.deepEqual(parseMeasureRange('57', '57', 57), {fromMeasure:56,toMeasure:56});
  for (const [a,b] of [['','12'],['0','3'],['4','3'],['1','58'],['2.5','4'],['foo','4'],['1','Infinity']])
    assert.equal(typeof parseMeasureRange(a,b,57), 'string');
});
