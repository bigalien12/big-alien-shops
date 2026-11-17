/* BIG ALIEN VENTURE - Firebase Cloud Messaging service worker
   Upload this file beside index.html and admin.html in /big-alien-shops/.
*/
importScripts("https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAK-eTsT7RVvwDwwhlI6EIOfV6S8IrBjPo",
  authDomain: "big-alien-venture-c66fb.firebaseapp.com",
  projectId: "big-alien-venture-c66fb",
  storageBucket: "big-alien-venture-c66fb.firebasestorage.app",
  messagingSenderId: "46156677359",
  appId: "1:46156677359:web:77b26b879de890d8405b1a"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // FCM automatically displays messages that contain a notification payload.
  // Show a notification here only for data-only messages to avoid duplicates.
  if (payload && payload.notification) return;

  const data = (payload && payload.data) || {};
  const title = data.title || "BIG ALIEN";
  const options = {
    body: data.body || data.message || "You have a new update.",
    icon: "/big-alien-shops/logo.png",
    badge: "/big-alien-shops/logo.png",
    data: {
      url: data.url || "/big-alien-shops/"
    }
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    (event.notification.data && event.notification.data.url) || "/big-alien-shops/",
    self.location.origin
  ).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin + "/big-alien-shops/")) {
        await client.focus();
        if ("navigate" in client && client.url !== targetUrl) {
          await client.navigate(targetUrl);
        }
        return;
      }
    }
    await clients.openWindow(targetUrl);
  })());
});
