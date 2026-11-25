import { renderMotorPreview } from './motor-preview.js?v=3.0.1';

const params=new URLSearchParams(location.search);
const preview=renderMotorPreview({driver:params.get('driver')});
document.getElementById('motor-preview').append(preview.element);
window.addEventListener('blur',preview.stop);
window.addEventListener('pagehide',preview.stop);
document.addEventListener('visibilitychange',()=>{if(document.hidden)preview.stop();});
