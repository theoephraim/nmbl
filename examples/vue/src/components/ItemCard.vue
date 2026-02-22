<script setup lang="ts">
interface Props {
  title: string;
  description?: string;
  count?: number;
  highlighted?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  showBadge?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
  highlighted: false,
  variant: 'primary',
  size: 'medium',
  showBadge: true
});

const emit = defineEmits<{
  click: [event: MouseEvent];
  update: [value: string];
  delete: [];
}>();

function handleClick(event: MouseEvent) {
  emit('click', event);
}

function handleDelete() {
  emit('delete');
}
</script>

<template lang="nmbl">
article.item-card(
  :class="[
    `item-card--${variant}`,
    `item-card--${size}`,
    { 'item-card--highlighted': highlighted }
  ]"
  @click="handleClick"
  :data-count="count"
  :aria-label="`Item card: ${title}`"
)
  header.item-card__header
    h3.item-card__title {{ title }}
    span.item-card__badge(v-if="showBadge && count > 0") {{ count }}

  div.item-card__body(v-if="description")
    p.item-card__description {{ description }}

  footer.item-card__footer
    slot(name="actions")
      button.item-card__delete(@click.stop="handleDelete") Remove

    //! Custom slot for additional content
    slot(name="extra")
</template>

<style scoped>
.item-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: white;
  cursor: pointer;
  transition: all 0.3s ease;
}

.item-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

/* Variant styles */
.item-card--primary {
  border-color: #42b883;
}

.item-card--secondary {
  border-color: #6c757d;
}

.item-card--danger {
  border-color: #f44336;
}

/* Size styles */
.item-card--small {
  padding: 0.5rem;
  font-size: 0.875rem;
}

.item-card--medium {
  padding: 1rem;
  font-size: 1rem;
}

.item-card--large {
  padding: 1.5rem;
  font-size: 1.125rem;
}

/* Highlighted state */
.item-card--highlighted {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.item-card--highlighted .item-card__title {
  color: white;
}

.item-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.item-card__title {
  margin: 0;
  color: #333;
  font-size: 1.2em;
}

.item-card__badge {
  background: #42b883;
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: bold;
}

.item-card__body {
  margin: 1rem 0;
}

.item-card__description {
  margin: 0;
  color: #666;
  line-height: 1.5;
}

.item-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
}

.item-card__delete {
  padding: 0.25rem 0.75rem;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.3s;
}

.item-card__delete:hover {
  background: #d32f2f;
}
</style>