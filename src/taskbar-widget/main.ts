import { createApp } from 'vue';
import TaskbarWidget from './TaskbarWidget.vue';
import './styles/widget.css';

const app = createApp(TaskbarWidget);
app.mount('#app');