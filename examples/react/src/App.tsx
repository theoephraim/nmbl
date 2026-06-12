import { useState } from 'react';
import { nmbl } from '@nmbl-lang/vite-plugin/tag';

interface Item {
  id: number;
  name: string;
  description?: string;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [items, setItems] = useState<Item[]>([
    { id: 1, name: 'Apple', description: 'Fresh red apple' },
    { id: 2, name: 'Banana', description: 'Yellow tropical fruit' },
    { id: 3, name: 'Cherry', description: 'Sweet summer fruit' },
  ]);
  const [newItem, setNewItem] = useState('');

  function toggle() {
    setLoggedIn(v => !v);
  }

  function addItem() {
    const name = newItem.trim();
    if (!name) return;
    setItems(prev => [...prev, { id: Date.now(), name }]);
    setNewItem('');
  }

  function removeItem(id: number) {
    setItems(prev => prev.filter(item => item.id !== id));
  }

  return nmbl`
    div#app
      //! NMBL + React — tagged template example
      h1.title NMBL + React Example

      button.toggle-btn(onClick=${toggle}) ${loggedIn ? 'Log out' : 'Log in'}

      @if(${loggedIn})
        div.content
          p.welcome Welcome back!
          h2 Your items
          p.item-count You have ${items.length} items in your list.

          //! Item list rendered via @each
          ul.item-list
            @each(item of ${items} :key="item.id")
              li.item
                span.item-name ${item.name}
                @if(${item.description})
                  span.item-desc ${item.description}
                button.remove-btn(onClick=${() => removeItem(item.id)}) ×

          div.add-row
            input.item-input(
              type="text"
              value=${newItem}
              placeholder="New item…"
              onChange=${(e: React.ChangeEvent<HTMLInputElement>) => setNewItem(e.target.value)}
              onKeyDown=${(e: React.KeyboardEvent) => e.key === 'Enter' && addItem()}
            )
            button.add-btn(
              onClick=${addItem}
              disabled=${!newItem.trim()}
            ) Add

      @else
        div.login-prompt
          p.info Please log in to see your items.
          p.hint Click the button above to get started!
  `;
}
