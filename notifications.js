
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
  if (!button) return;

  button.addEventListener("click", async () => {
    const originalText = button.textContent;

    try {
      button.disabled = true;
      button.textContent = "Enabling notifications...";

      if (!("serviceWorker" in navigator) ||
          !("Notification" in window)) {
        throw new Error("Web push is not supported in this browser.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Please allow notifications in your device settings.");
      }

      const [appModule, messagingModule, supabaseModule] =
        await Promise.all([
          import("https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging.js"),
          import("https://esm.sh/@supabase/supabase-js@2")
        ]);

      const cfg = window.BIG_ALIEN_CONFIG;
      if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_PUBLISHABLE_KEY) {
        throw new Error("Supabase configuration was not found.");
      }

      const sb = supabaseModule.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_PUBLISHABLE_KEY
      );

      const { data: sessionData, error: sessionError } =
        await sb.auth.getSession();

      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session?.user) {
        throw new Error("Please sign in to your Big Alien account first.");
      }

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

      const messaging = messagingModule.getMessaging(app);

      const token = await messagingModule.getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (!token) {
        throw new Error("Firebase did not return a device token.");
      }

      const { error: saveError } = await sb
        .from("push_tokens")
        .upsert(
          {
            user_id: session.user.id,
            token,
            updated_at: new Date().toISOString()
          },
          { onConflict: "token" }
        );

      if (saveError) throw saveError;

      localStorage.setItem("bigAlienFCMToken", token);

      button.textContent = "Notifications Enabled ✓";
      alert("Notifications are enabled and your device token was saved.");

    } catch (error) {
      console.error("Big Alien notification error:", error);
      alert("Could not enable notifications.\n\n" +
        (error.message || "Please try again."));
      button.textContent = originalText;
    } finally {
      button.disabled = false;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded",
    setupBigAlienNotifications, { once: true });
} else {
  setupBigAlienNotifications();
}
