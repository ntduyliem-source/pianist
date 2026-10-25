import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from '../src/shared/search';
import { matchesBundledWork } from '../src/platform/bundled-library';
import { matchingMeasures, measureLabel, parseMeasureRange } from '../src/practice/measure-range';
import { PracticeEngine, attemptCsv, resultFor } from '../../../packages/practice-engine-v2';
import { midi, timeline } from './helpers/fixtures-v2';

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
  const measures = Array.from({length:57}, (_, index) => ({index, label:index + 1}));
  assert.deepEqual(parseMeasureRange('12', '20', measures), {fromMeasure:11,toMeasure:19});
  assert.deepEqual(parseMeasureRange('57', '57', measures), {fromMeasure:56,toMeasure:56});
  for (const [a,b] of [['','12'],['0','3'],['4','3'],['1','58'],['2.5','4'],['foo','4'],['1','Infinity']])
    assert.equal(typeof parseMeasureRange(a,b,measures), 'string');
});

test('native pickup and renamed measures select the printed number, not index plus one', () => {
  const pickup = [0,1,2,3,8,9].map((label,index) => ({label,index}));
  assert.deepEqual(parseMeasureRange('0','2',pickup), {fromMeasure:0,toMeasure:2});
  assert.deepEqual(parseMeasureRange('8','9',pickup), {fromMeasure:4,toMeasure:5});
  assert.equal(typeof parseMeasureRange('4','9',pickup), 'string');
  assert.equal(measureLabel(pickup,0), '0');
  assert.equal(measureLabel(pickup,4), '8');
  assert.equal(measureLabel(undefined,4), 'thứ 5');
  assert.deepEqual(matchingMeasures('8.0',pickup), []);
  assert.deepEqual(matchingMeasures('',pickup), []);
});

test('repeated labels require explicit identity and preserve sheet order across numbering resets', () => {
  const measures = [1,2,2,3,1,2].map((label,index) => ({label,index}));
  assert.match(String(parseMeasureRange('2','3',measures)), /xuất hiện 3 lần/);
  assert.deepEqual(parseMeasureRange('2','3',measures,{fromIndex:2}), {fromMeasure:2,toMeasure:3});
  assert.equal(typeof parseMeasureRange('2','3',measures,{fromIndex:4}), 'string');
  assert.equal(typeof parseMeasureRange('2','3',measures,{fromIndex:5}), 'string');
  assert.deepEqual(parseMeasureRange('3','1',measures,{toIndex:4}), {fromMeasure:3,toMeasure:4});
  assert.equal(measureLabel(measures,2), '2 (ô thứ 3)');
  assert.deepEqual(parseMeasureRange('2','2',measures,{fromIndex:2,toIndex:5}), {fromMeasure:2,toMeasure:5});
});

test('result CSV preserves native label zero separately from physical measure order and keeps grading unchanged', () => {
  const t = timeline(), engine = new PracticeEngine(t);
  engine.input(midi(1,'on',500)); engine.input(midi(2,'off',600)); engine.clock(2000);
  const result = resultFor(t,engine.view(),'Pickup','complete',2000);
  const before = structuredClone(result);
  result.measureLabels = [{index:0,label:0}];
  const rows = attemptCsv(result).replace(/^\uFEFF/,'').split('\r\n').map(row => row.split(',').map(cell => cell.slice(1,-1)));
  assert.equal(rows[1][rows[0].indexOf('measure')], '0');
  assert.equal(rows[1][rows[0].indexOf('measure_order')], '1');
  assert.equal(attemptCsv(before).split('\r\n')[1].split(',')[1], '""');
  assert.deepEqual(result.metrics,before.metrics);
  assert.deepEqual(result.timeline,before.timeline);
});
