import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HabitatView } from './components/desk/habitat/HabitatView';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<StrictMode><HabitatView /></StrictMode>);
