import { matchString, Category } from '~/util/classes';
import {
  MANUAL_CATEGORY_KEY,
  getManualCategory,
  manualCategoryRules,
  suggestRuleRegex,
  withManualCategory,
} from '~/util/manualCategory';

const categories: Category[] = [
  { name: ['Work'], rule: { type: 'none' } },
  { name: ['Work', 'Programming'], rule: { type: 'regex', regex: 'vim' } },
  { name: ['Media', 'Video'], rule: { type: 'regex', regex: 'YouTube' } },
  { name: ['Weird (1.0)'], rule: { type: 'none' } },
];

function event(data: Record<string, any>) {
  return { id: 1, timestamp: '2026-10-16T10:00:00Z', duration: 60, data };
}

describe('withManualCategory / getManualCategory', () => {
  test('sets and reads back the category without mutating the event', () => {
    const e = event({ app: 'foo', title: 'bar' });
    const updated = withManualCategory(e, ['Work', 'Programming']);
    expect(updated.data[MANUAL_CATEGORY_KEY]).toEqual('Work>Programming');
    expect(getManualCategory(updated)).toEqual(['Work', 'Programming']);
    expect(e.data[MANUAL_CATEGORY_KEY]).toBeUndefined();
    expect(updated.id).toEqual(1);
  });

  test('removes the category when passed null', () => {
    const e = withManualCategory(event({ app: 'foo' }), ['Work']);
    const removed = withManualCategory(e, null);
    expect(MANUAL_CATEGORY_KEY in removed.data).toBe(false);
    expect(getManualCategory(removed)).toBeNull();
  });
});

describe('manualCategoryRules', () => {
  test('one high-priority rule per category, matching only the manual key', () => {
    const rules = manualCategoryRules([['Work'], ['Work', 'Programming'], ['Uncategorized']]);
    expect(rules).toHaveLength(2);
    const [name, rule] = rules[1];
    expect(name).toEqual(['Work', 'Programming']);
    expect(rule.select_keys).toEqual([MANUAL_CATEGORY_KEY]);
    expect(rule.priority).toBeGreaterThan(1000);
    expect(new RegExp(rule.regex).test('Work>Programming')).toBe(true);
    expect(new RegExp(rule.regex).test('Work>Programming>Sub')).toBe(false);
  });

  test('escapes regex characters in category names', () => {
    const [[, rule]] = manualCategoryRules([['Weird (1.0)']]);
    expect(new RegExp(rule.regex).test('Weird (1.0)')).toBe(true);
    expect(new RegExp(rule.regex).test('Weird 1x0')).toBe(false);
  });
});

describe('matchString with a manual category', () => {
  test('uncategorized event gets the manual category', () => {
    const e = withManualCategory(event({ app: 'foo', title: 'bar' }), ['Media', 'Video']);
    expect(matchString('foo\nbar', categories, e).name).toEqual(['Media', 'Video']);
  });

  test('manual category wins over a deeper matching rule', () => {
    const e = withManualCategory(event({ app: 'vim', title: 'x' }), ['Work']);
    expect(matchString('vim\nx', categories, e).name).toEqual(['Work']);
  });

  test('falls back to the rules if the category no longer exists', () => {
    const e = withManualCategory(event({ app: 'vim', title: 'x' }), ['Deleted']);
    expect(matchString('vim\nx', categories, e).name).toEqual(['Work', 'Programming']);
  });
});

describe('suggestRuleRegex', () => {
  test('uses the escaped app name for window events', () => {
    expect(suggestRuleRegex('currentwindow', event({ app: 'Code.exe', title: 't' }))).toEqual(
      'Code\\.exe'
    );
  });

  test('uses the domain for web events', () => {
    const e = event({ url: 'https://www.example.com/page', title: 'Example' });
    expect(suggestRuleRegex('web.tab.current', e)).toEqual('example\\.com');
  });
});
