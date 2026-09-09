import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ForumApp } from './components/debate/ForumApp';
import './styles/app.css';
const Legacy = lazy(() => import('./components/desk/habitat/HabitatView').then(module => ({default: module.HabitatView})));
const legacy = new URLSearchParams(location.search).get('legacy') === '1';
createRoot(document.getElementById('root')!).render(<StrictMode>{legacy ? <Suspense fallback={<p>Opening the historical habitat…</p>}><Legacy/></Suspense> : <ForumApp/>}</StrictMode>);
