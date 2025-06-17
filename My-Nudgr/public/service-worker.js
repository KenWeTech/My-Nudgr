self.addEventListener('install', event => {
  console.log('Service Worker: Installed');
  self.skipWaiting(); // Optional: activate immediately
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activated');
});

self.addEventListener('fetch', event => {
  // You can add caching here if needed
  console.log('Fetching:', event.request.url);
});
