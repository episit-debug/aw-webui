// Manual category assignment for single events.
//
// The assigned category is stored on the event itself, as an extra data key
// (written back with replaceEvent). Categorization then needs no server
// changes: for every category, classes_for_query adds a rule that only looks
// at that key (select_keys) and has a very high priority, so it beats every
// regular rule. aw-server (Python) and aw-server-rust both already support
// select_keys and priority in categorize().
import type { Category, Rule } from './classes';
import type { IEvent } from './interfaces';

export const MANUAL_CATEGORY_KEY = '$manual_category';
export const MANUAL_CATEGORY_PRIORITY = 1_000_000;

// Same separator as category names in the editor ("Work>Programming"), so it
// can't appear inside a single category segment.
const SEP = '>';

export function manualCategoryValue(name: string[]): string {
  return name.join(SEP);
}

/** The manually assigned category of an event, or null if it has none. */
export function getManualCategory(e: IEvent | null | undefined): string[] | null {
  const value = e?.data?.[MANUAL_CATEGORY_KEY];
  if (typeof value !== 'string' || !value) {
    return null;
  }
  return value.split(SEP);
}

/** Returns a copy of the event with the manual category set, or removed when `name` is null. */
export function withManualCategory<T extends IEvent>(e: T, name: string[] | null): T {
  const data = { ...e.data };
  if (name && name.length > 0) {
    data[MANUAL_CATEGORY_KEY] = manualCategoryValue(name);
  } else {
    delete data[MANUAL_CATEGORY_KEY];
  }
  return { ...e, data };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isUncategorized(name: string[]): boolean {
  return name.length === 1 && name[0] === 'Uncategorized';
}

/** Query rules that apply manual assignments, one per category path. */
export function manualCategoryRules(names: string[][]): [string[], Rule][] {
  return names
    .filter(name => name.length > 0 && !isUncategorized(name))
    .map(name => [
      name,
      {
        type: 'regex',
        regex: '^' + escapeRegex(manualCategoryValue(name)) + '$',
        select_keys: [MANUAL_CATEGORY_KEY],
        priority: MANUAL_CATEGORY_PRIORITY,
      },
    ]);
}

/** The category an event was manually assigned to, if it still exists. */
export function findManualCategory(
  e: IEvent | null | undefined,
  categories: Category[]
): Category | null {
  const name = getManualCategory(e);
  if (!name) {
    return null;
  }
  const joined = manualCategoryValue(name);
  return categories.find(c => manualCategoryValue(c.name) === joined) || null;
}

/**
 * Suggest a regex for a rule matching events similar to this one: the window
 * title for browsers and stopwatch labels, otherwise the app name.
 */
export function suggestRuleRegex(bucketType: string | undefined, e: IEvent): string {
  let value: unknown;
  if (bucketType == 'web.tab.current') {
    const url = typeof e.data.url === 'string' ? e.data.url : '';
    const domain = url.match(/^.+:\/\/(?:www\.)?([^/]+)/);
    value = domain ? domain[1] : e.data.title;
  } else if (bucketType?.startsWith('general.stopwatch')) {
    value = e.data.label;
  } else if (bucketType?.startsWith('app.editor')) {
    value = e.data.project || e.data.file;
  } else {
    value = e.data.app || e.data.title;
  }
  return typeof value === 'string' && value ? escapeRegex(value) : '';
}
