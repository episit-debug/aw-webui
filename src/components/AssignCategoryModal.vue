<template lang="pug">
// Manually assign a category to a single event (see util/manualCategory.ts)
b-modal(id="assign-category-modal", ref="modal", title="Assign category", centered, hide-footer, @hidden="onHidden")
  div(v-if="event")
    table.assign-category-info.mb-3
      tr
        th Bucket
        td {{ bucket.id }}
      tr
        th Time
        td {{ event.timestamp | iso8601 }} ({{ event.duration | friendlyduration }})
      tr(v-for="key in shownKeys", :key="key")
        th {{ key }}
        td.text-break {{ event.data[key] }}
      tr
        th Category
        td
          span {{ currentCategoryText }}
          span.badge.badge-secondary.ml-1(v-if="manualCategory") manual

    div(v-if="step === 'assign'")
      b-form-group(label="Assign to category", label-for="assign-category-select")
        b-form-select#assign-category-select(v-model="selected", :options="categoryOptions")
      small.text-muted
        | Only this event is assigned. Your categorization rules stay unchanged.

      div.text-danger.mt-2(v-if="error") {{ error }}

      div.mt-3.d-flex
        b-button.mr-auto(v-if="manualCategory", variant="outline-danger", size="sm", :disabled="saving", @click="assign(null)")
          | Remove manual category
        b-button.ml-auto(@click="close", size="sm") Cancel
        b-button.ml-2(variant="primary", size="sm", :disabled="!selected || saving", @click="assign(selected)")
          | Assign

    div(v-else-if="step === 'rule'")
      p.mb-2
        | Assigned to #[b {{ selected.join(' > ') }}].
        |  Create a rule for all similar events?
      b-input-group(prepend="Pattern", size="sm")
        b-form-input(v-model="rulePattern")
      small.text-danger(v-if="rulePattern && !validPattern") Invalid pattern
      small.text-muted(v-else)
        | Added to the rule of #[i {{ selected.join(' > ') }}] (as an alternative, with "|").

      div.text-danger.mt-2(v-if="error") {{ error }}

      div.mt-3.d-flex
        b-button.ml-auto(@click="close", size="sm") No thanks
        b-button.ml-2(variant="primary", size="sm", :disabled="!rulePattern || !validPattern || saving", @click="createRule")
          | Create rule
</template>

<style lang="scss" scoped>
.assign-category-info {
  width: 100%;
  font-size: 0.9em;

  th {
    padding-right: 1em;
    vertical-align: top;
    white-space: nowrap;
  }
}
</style>

<script lang="ts">
import _ from 'lodash';
import { useCategoryStore } from '~/stores/categories';
import { matchString } from '~/util/classes';
import { getCategorizationStringFromEvent } from '~/util/color';
import { getManualCategory, suggestRuleRegex, withManualCategory } from '~/util/manualCategory';

const SHOWN_KEYS = ['app', 'title', 'url', 'label', 'file'];

export default {
  name: 'AssignCategoryModal',
  props: {
    // The full event, as fetched from the bucket (must have an id)
    event: { type: Object, default: null },
    bucket: { type: Object, default: null },
  },
  data() {
    return {
      categoryStore: useCategoryStore(),
      step: 'assign',
      selected: null as string[] | null,
      rulePattern: '',
      saving: false,
      error: '',
    };
  },
  computed: {
    shownKeys(): string[] {
      return SHOWN_KEYS.filter(k => typeof this.event.data[k] === 'string');
    },
    manualCategory(): string[] | null {
      return getManualCategory(this.event);
    },
    currentCategoryText(): string {
      const str = getCategorizationStringFromEvent(this.bucket, this.event);
      const match = str !== null ? matchString(str, this.categoryStore.classes, this.event) : null;
      return match ? match.name.join(' > ') : 'Uncategorized';
    },
    categoryOptions() {
      const options = this.categoryStore.allCategoriesSelect.filter(
        o => !_.isEqual(o.value, ['Uncategorized'])
      );
      return [{ value: null, text: 'Select a category...', disabled: true }, ...options];
    },
    validPattern(): boolean {
      try {
        new RegExp(this.rulePattern);
        return true;
      } catch (e) {
        return false;
      }
    },
  },
  methods: {
    show() {
      if (!this.categoryStore.classes_unsaved_changes) {
        this.categoryStore.load();
      }
      this.step = 'assign';
      this.selected = this.manualCategory;
      this.rulePattern = suggestRuleRegex(this.bucket.type, this.event);
      this.error = '';
      this.$refs.modal.show();
    },
    close() {
      this.$refs.modal.hide();
    },
    onHidden() {
      this.step = 'assign';
      this.saving = false;
    },
    async assign(category: string[] | null) {
      this.saving = true;
      this.error = '';
      try {
        const updated = withManualCategory(this.event, category);
        await this.$aw.replaceEvent(this.bucket.id, updated);
        this.$emit('assigned', { event: updated, category });
        if (category && this.rulePattern) {
          this.step = 'rule';
        } else {
          this.close();
        }
      } catch (e) {
        console.error('Failed to assign category', e);
        this.error = 'Could not save the event: ' + (e.message || e);
      } finally {
        this.saving = false;
      }
    },
    async createRule() {
      const cat = this.categoryStore.classes.find(c => _.isEqual(c.name, this.selected));
      if (!cat) {
        this.error = `Category "${this.selected.join(' > ')}" not found.`;
        return;
      }
      this.saving = true;
      this.error = '';
      try {
        this.categoryStore.appendClassRule(cat.id, this.rulePattern);
        await this.categoryStore.save();
        this.$emit('rule-created', { category: this.selected, pattern: this.rulePattern });
        this.close();
      } catch (e) {
        console.error('Failed to create rule', e);
        this.error = 'Could not save the rule: ' + (e.message || e);
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>
