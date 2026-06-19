<script setup lang="ts">
interface Props {
  /** some description of the label */
  label?: string;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
}

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  fullWidth: false,
  iconPosition: 'left'
});

const emit = defineEmits<{
  click: [event: MouseEvent];
  hover: [event: MouseEvent];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();
</script>

<template lang="nmbl">
button.btn(
  :type="type"
  :class="[
    `btn--${variant}`,
    `btn--${size}`,
    {
      'btn--disabled': disabled || loading,
      'btn--loading': loading,
      'btn--full-width': fullWidth
    }
  ]"
  :disabled="disabled || loading"
  @click="emit('click', $event)"
  @mouseenter="emit('hover', $event)"
  @focus="emit('focus', $event)"
  @blur="emit('blur', $event)"
)
  span.btn__spinner(v-if="loading") ⟳

  span.btn__icon(v-if="icon && iconPosition === 'left'") {{ icon }}

  span.btn__label(v-if="label") {{ label }}
  slot(v-else)

  span.btn__icon(v-if="icon && iconPosition === 'right'") {{ icon }}
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: inherit;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  white-space: nowrap;
}

/* Size variants */
.btn--xs {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.btn--md {
  padding: 0.5rem 1rem;
  font-size: 1rem;
}

.btn--lg {
  padding: 0.625rem 1.25rem;
  font-size: 1.125rem;
}

.btn--xl {
  padding: 0.75rem 1.5rem;
  font-size: 1.25rem;
}

/* Variant colors */
.btn--primary {
  background-color: #42b883;
  color: white;
}

.btn--primary:hover:not(.btn--disabled) {
  background-color: #35a372;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(66, 184, 131, 0.3);
}

.btn--secondary {
  background-color: #6c757d;
  color: white;
}

.btn--secondary:hover:not(.btn--disabled) {
  background-color: #5a6268;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(108, 117, 125, 0.3);
}

.btn--success {
  background-color: #10b981;
  color: white;
}

.btn--success:hover:not(.btn--disabled) {
  background-color: #059669;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);
}

.btn--danger {
  background-color: #ef4444;
  color: white;
}

.btn--danger:hover:not(.btn--disabled) {
  background-color: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(239, 68, 68, 0.3);
}

.btn--warning {
  background-color: #f59e0b;
  color: white;
}

.btn--warning:hover:not(.btn--disabled) {
  background-color: #d97706;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(245, 158, 11, 0.3);
}

/* States */
.btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

.btn--loading {
  cursor: wait;
}

.btn--full-width {
  width: 100%;
}

/* Icon and spinner */
.btn__spinner {
  animation: spin 1s linear infinite;
  font-size: 1.2em;
}

.btn__icon {
  font-size: 1.1em;
}

.btn__label {
  display: inline-block;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Focus state */
.btn:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>