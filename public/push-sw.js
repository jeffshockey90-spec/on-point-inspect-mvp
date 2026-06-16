self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();

  self.registration.showNotification(data.title || "On Point Inspect", {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow("/")
  );
});