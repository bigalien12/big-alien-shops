
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js');

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
  const title = payload.notification?.title || "Big Alien Venture";
  const options = {
    body: payload.notification?.body || "You have a new order update.",
    icon: "/big-alien-shops/big-alien-icon-512.png"
  };

  self.registration.showNotification(title, options);
});
