// Uploaded images and previs videos live in IndexedDB until GitHub sync publishes them.
// Project JSON contains paths and captions, never large image data or tokens.
window.TrackerMedia = (() => {
  let dbPromise;
  const urls = new Map();
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve,reject)=>{
      const request=indexedDB.open('eternal-tomb-images-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'path'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Image storage is unavailable in this browser.'));
    });return dbPromise;
  }
  async function transaction(mode, action) {
    const database=await db();return new Promise((resolve,reject)=>{
      const tx=database.transaction('images',mode);const request=action(tx.objectStore('images'));let result;
      request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Image storage failed.'));
    });
  }
  const get=path=>transaction('readonly',s=>s.get(path));
  const put=value=>transaction('readwrite',s=>s.put(value));
  const all=()=>transaction('readonly',s=>s.getAll());
  async function store(path,blob) {await put({path,blob,uploaded:false});urls.set(path,URL.createObjectURL(blob));}
  async function markUploaded(path) {const entry=await get(path);if(entry){entry.uploaded=true;await put(entry);}}
  async function hydrate() {try {for(const entry of await all())if(!urls.has(entry.path))urls.set(entry.path,URL.createObjectURL(entry.blob));}catch{} }
  function src(path) {return urls.get(path)||(path.startsWith('uploads/') ? 'https://raw.githubusercontent.com/jens-lund/mail-shot-tracker/main/eternal-tomb/'+path : path);}
  async function prepare(file) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG or WebP image.');
    if(file.size>15*1024*1024)throw new Error('Use an image smaller than 15 MB.');
    const bitmap=await createImageBitmap(file);
    if(bitmap.width*bitmap.height>60000000){bitmap.close();throw new Error('This image is too large. Export a smaller copy.');}
    const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));if(!blob)throw new Error('Could not prepare this image.');return blob;
  }
  function prepareVideo(file) {
    const extension = file.name.toLowerCase().match(/\.(mp4|webm)$/)?.[1];
    const type = extension === 'mp4' ? 'video/mp4' : extension === 'webm' ? 'video/webm' : '';
    if (!type || (file.type && file.type !== type)) throw new Error('Choose an MP4 or WebM video.');
    if (!file.size || file.size > window.TrackerCore.maxVideoBytes) throw new Error('Use a previs video between 1 byte and 25 MB. Export a smaller review copy if needed.');
    return {blob:file.slice(0,file.size,type),extension,type};
  }
  async function base64(blob) {const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
  return {get,store,markUploaded,hydrate,src,prepare,prepareVideo,base64,all};
})();
