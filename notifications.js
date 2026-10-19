
const firebaseConfig = {
  apiKey: "AIzaSyAK-eTsT7RVvwDwwhlI6EIOfV6S8IrBjPo",
  authDomain: "big-alien-venture-c66fb.firebaseapp.com",
  projectId: "big-alien-venture-c66fb",
  storageBucket: "big-alien-venture-c66fb.firebasestorage.app",
  messagingSenderId: "46156677359",
  appId: "1:46156677359:web:77b26b879de890d8405b1a"
};

const VAPID_KEY =
  "BN9PWHgPIcz1ARHQurmL2gyzPvV2iwBNkEaj9Q_o-dR4U5-dw_O9YRMkGLrM3c7nyuQo3glEOiE6YGWFCy99uWQ";

async function setupBigAlienNotifications() {
  const button = document.getElementById("enablePushNotifications");

  if (!button) {
    console.error("Notification button was not found.");
    return;
  }

  button.addEventListener("click", async () => {
    const originalText = button.textContent;

    try {
      button.disabled = true;
      button.textContent = "Enabling notifications...";

      if (!("serviceWorker" in navigator) ||
          !("Notification" in window)) {
        throw new Error(
          "This browser does not support web push notifications."
        );
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        throw new Error(
          "Notifications were not allowed. Enable them in your browser settings."
        );
      }

      const appModule = await import(
        "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js"
      );

      const messagingModule = await import(
        "https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging.js"
      );

      const existingApp = appModule.getApps().find(
        app => app.name === "BigAlienNotifications"
      );

      const app = existingApp || appModule.initializeApp(
        firebaseConfig,
        "BigAlienNotifications"
      );

      const registration = await navigator.serviceWorker.register(
        "/big-alien-shops/firebase-messaging-sw.js",
        { scope: "/big-alien-shops/" }
      );

      await navigator.serviceWorker.ready;

      const messaging = messagingModule.getMessaging(app);

      const token = await messagingModule.getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (!token) {
        throw new Error(
          "Firebase did not return a notification token."
        );
      }

      localStorage.setItem("bigAlienFCMToken", token);

      button.textContent = "Notifications Enabled ✓";

      alert(
        "Notifications are enabled on this device! " +
        "You can now receive supported Big Alien notifications."
      );

      console.log("Big Alien notification registration succeeded.");

    } catch (error) {
      console.error("Big Alien notification error:", error);

      alert(
        "Could not enable notifications.\n\n" +
        (error.message || "Please try again.")
      );

      button.textContent = originalText;

    } finally {
      button.disabled = false;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    setupBigAlienNotifications,
    { once: true }
  );
} else {
  setupBigAlienNotifications();
}
