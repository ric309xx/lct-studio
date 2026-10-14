import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
if('serviceWorker' in navigator)window.addEventListener('load',()=>{
  navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(registration=>{
    const update=()=>{if(navigator.onLine)registration.update().catch(()=>{});};
    update();
    window.addEventListener('online',update);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')update();});
  }).catch(()=>{});
});
