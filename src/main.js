import { mount } from 'svelte'
import './index.css'
import App from './App.svelte'

const target = document.getElementById('app');
if (!target) {
  throw new Error("Could not find element with id 'app'");
}
const app = mount(App, {
  target,
})

export default app
