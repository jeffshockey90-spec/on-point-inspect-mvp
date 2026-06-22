self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};

  try {
    data = event.data.json();
  } catch {
    data = {
      title: "On Point Inspect",
      body: event.data.text(),
      url: "/",
    };
  }

  const url =
    data.url ||
    data.link ||
    data.route ||
    data.deepLink ||
    data.deep_link ||
    "/";

  const eventType =
    data.eventType ||
    data.event_type ||
    "push";

  console.log("On Point push payload:", data);
  console.log("On Point push URL:", url);

  event.waitUntil(
    self.registration.showNotification(
      data.title || "On Point Inspect",
      {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: {
          url,
          eventType,
        },
      }
    )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  let targetUrl =
    event.notification?.data?.url ||
    "/";

  console.log("On Point notification click URL:", targetUrl);

  try {
    if (
      typeof targetUrl === "string" &&
      (targetUrl.startsWith("http://") ||
        targetUrl.startsWith("https://"))
    ) {
      const parsed = new URL(targetUrl);

      targetUrl =
        parsed.pathname +
        parsed.search +
        parsed.hash;
    }
  } catch (error) {
    console.error("Push URL parse error:", error);
    targetUrl = "/";
  }

  if (!String(targetUrl).startsWith("/")) {
    targetUrl = `/${targetUrl}`;
  }

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          try {
            const clientUrl = new URL(client.url);

            if (
              clientUrl.origin === self.location.origin
            ) {
              if ("focus" in client) {
                client.focus();
              }

              if ("navigate" in client) {
                return client.navigate(targetUrl);
              }
            }
          } catch {}
        }

        return clients.openWindow(targetUrl);
      })
  );
});