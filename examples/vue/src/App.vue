<script setup lang="ts">
import { ref } from 'vue';
import ItemCard from './components/ItemCard.vue';
import Badge from './components/Badge.vue';
import Button from './components/Button.vue';

interface Item {
  id: number;
  name: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
}

const loggedIn = ref(false);
const items = ref<Item[]>([
  { id: 1, name: 'Apple', description: 'Fresh red apple', priority: 'low' },
  { id: 2, name: 'Banana', description: 'Yellow tropical fruit', priority: 'medium' },
  { id: 3, name: 'Cherry', description: 'Sweet summer fruit', priority: 'high' }
]);
const newItem = ref('');
const newItemDescription = ref('');
const newItemPriority = ref<'low' | 'medium' | 'high'>('medium');
const selectedSize = ref<'small' | 'medium' | 'large'>('medium');

let nextId = 4;

function toggle() {
  loggedIn.value = !loggedIn.value;
}

function addItem() {
  if (newItem.value.trim()) {
    items.value.push({
      id: nextId++,
      name: newItem.value.trim(),
      description: newItemDescription.value.trim() || undefined,
      priority: newItemPriority.value
    });
    newItem.value = '';
    newItemDescription.value = '';
    newItemPriority.value = 'medium';
  }
}

function removeItem(index: number) {
  items.value.splice(index, 1);
}

function handleCardClick(item: Item, event: MouseEvent) {
  console.log('Card clicked:', item.name, event);
}

function getPriorityColor(priority: string): 'green' | 'yellow' | 'red' {
  switch (priority) {
    case 'low': return 'green';
    case 'medium': return 'yellow';
    case 'high': return 'red';
    default: return 'green';
  }
}

function getVariant(priority: string): 'primary' | 'secondary' | 'danger' {
  switch (priority) {
    case 'high': return 'danger';
    case 'medium': return 'secondary';
    default: return 'primary';
  }
}

function handleTitleClick() {
  console.log('title clicked');
}
</script>

<template lang="nmbl">
div#app
  h1.title(@click="handleTitleClick")
    | NMBL + Vue Example
    Badge.title-badge(text="Beta" color="blue" rounded)

  // comment
  //- another comment
  Button(
    :label="loggedIn ? 'Log out' : 'Log in'"
    variant="primary"
    size="lg"
    @click="toggle"
    style="margin: 0 auto 2rem; display: block"
  )

  div.content(v-if="loggedIn")
    p.welcome Welcome back! You are logged in.

    h2 Your Items
    p.item-count You have {{ items.length ?? 0 }} items in your list.

    //! Display size selector
    div.size-selector
      label Size:
      select(v-model="selectedSize")
        option(value="small") Small
        option(value="medium") Medium
        option(value="large") Large

    //! Use ItemCard component for each item
    div.items-container
      ItemCard(
        v-for="(item, i) in items"
        :key="item.id"
        :title="item.name"
        :description="item.description"
        :count="i + 1"
        :highlighted="item.priority === 'high'"
        :variant="getVariant(item.priority)"
        :size="selectedSize"
        @click="handleCardClick(item, $event)"
        @delete="removeItem(i)"
      )
        template(#actions)
          Badge(
            :text="item.priority"
            :color="getPriorityColor(item.priority)"
            outline
            style="margin-right: 0.5rem"
          )
          Button(
            label="Remove"
            variant="danger"
            size="sm"
            icon="×"
            @click.stop="removeItem(i)"
          )
        template(#extra)
          span.extra-info Item #{{ item.id }}

    //! Add new item form
    div.add-item-form
      h3 Add New Item

      div.form-group
        input.item-input(
          v-model="newItem"
          type="text"
          placeholder="Item name..."
          @keyup.enter="addItem"
        )

      div.form-group
        textarea.item-textarea(
          v-model="newItemDescription"
          placeholder="Description (optional)..."
          rows="2"
        )

      div.form-group
        label Priority:
        select.priority-select(v-model="newItemPriority")
          option(value="low") Low
          option(value="medium") Medium
          option(value="high") High

      Button(
        variant="success"
        size="lg"
        icon="+"
        :disabled="!newItem.trim()"
        @click="addItem"
      )
        | Add Item
        Badge(
          v-if="newItemPriority === 'high'"
          text="!"
          color="red"
          rounded
          style="margin-left: 0.5rem"
        )

  div.login-prompt(v-else)
    p.info Please log in to see and manage your items.
    p.hint Click the button above to get started!
</template>

<style scoped>
#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  max-width: 600px;
  margin: 2rem auto;
  padding: 2rem;
  background: #f9f9f9;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.title {
  color: #333;
  margin-bottom: 1.5rem;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.title-badge {
  vertical-align: middle;
}

.toggle-btn {
  display: block;
  margin: 0 auto 2rem;
  padding: 0.5rem 1.5rem;
  font-size: 1rem;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.toggle-btn:hover {
  background: #35a372;
}

.welcome {
  color: #42b883;
  font-weight: bold;
  margin-bottom: 1rem;
}

.item-count {
  color: #666;
  margin-bottom: 1rem;
}

.item-list {
  list-style: none;
  padding: 0;
  margin-bottom: 2rem;
}

.item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.item-number {
  color: #999;
  margin-right: 0.5rem;
  min-width: 2rem;
}

.item-name {
  flex: 1;
  color: #333;
}

.remove-btn {
  padding: 0.25rem 0.5rem;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
  transition: background 0.3s;
}

.remove-btn:hover {
  background: #d32f2f;
}

.add-item {
  display: flex;
  gap: 0.5rem;
}

.item-input {
  flex: 1;
  padding: 0.5rem;
  font-size: 1rem;
  border: 2px solid #ddd;
  border-radius: 4px;
  transition: border-color 0.3s;
}

.item-input:focus {
  outline: none;
  border-color: #42b883;
}

.add-btn {
  padding: 0.5rem 1.5rem;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s;
}

.add-btn:hover:not(:disabled) {
  background: #35a372;
}

.add-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.login-prompt {
  text-align: center;
  padding: 2rem;
}

.info {
  color: #333;
  font-size: 1.1rem;
  margin-bottom: 1rem;
}

.hint {
  color: #666;
  font-style: italic;
}

/* New styles for custom components */
.size-selector {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.size-selector label {
  font-weight: 600;
  color: #333;
}

.size-selector select {
  padding: 0.25rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.items-container {
  margin-bottom: 2rem;
}

.add-item-form {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.add-item-form h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #333;
}

.form-group {
  margin-bottom: 1rem;
}

.item-textarea {
  width: 100%;
  padding: 0.5rem;
  font-size: 1rem;
  font-family: inherit;
  border: 2px solid #ddd;
  border-radius: 4px;
  resize: vertical;
  transition: border-color 0.3s;
}

.item-textarea:focus {
  outline: none;
  border-color: #42b883;
}

.priority-select {
  padding: 0.5rem;
  font-size: 1rem;
  border: 2px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  transition: border-color 0.3s;
  margin-left: 0.5rem;
}

.priority-select:focus {
  outline: none;
  border-color: #42b883;
}

.extra-info {
  color: #999;
  font-size: 0.875rem;
  font-style: italic;
}
</style>