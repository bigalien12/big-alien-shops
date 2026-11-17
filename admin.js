const cfg = window.BIG_ALIEN_CONFIG || {};
const ready =
  cfg.SUPABASE_URL &&
  !cfg.SUPABASE_URL.includes("PASTE_") &&
  cfg.SUPABASE_PUBLISHABLE_KEY &&
  !cfg.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");
const sb = ready
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY)
  : null;
let adminUser = null;
let adminProductsCache = [];
let adminDepartmentFilter = "general";
const $ = (id) => document.getElementById(id);
const money = (n) =>
  "₦" + Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 });
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
        m
      ])
  );
const img = (u) => u || "images/logo.png";
const specialRequestFromNotes = (notes) => {
  const match = String(notes || "").match(/Customer special request:\s*([\s\S]*?)(?=\n\n|$)/i);
  return match ? match[1].trim() : "";
};
const specialRequestHtml = (order) => {
  const request = specialRequestFromNotes(order?.notes);
  return request ? `<div class="summary"><b>Customer special request</b><p style="white-space:pre-wrap">${esc(request)}</p></div>` : "";
};
const rewardsInfoHtml = (order) => {
  const points = Math.max(0, Number(order.reward_points_used || 0));
  const discount = Math.max(0, Number(order.reward_discount || 0));
  return `<div class="summary" style="margin:10px 0"><b>BIG ALIEN Rewards</b><p>Points redeemed: ${points.toLocaleString("en-NG")}</p><p>Discount given: ${money(discount)}</p><p>Order total after discount: <b>${money(order.total)}</b></p></div>`;
};

function showDenied() {
  $("checking").classList.add("hidden");
  $("adminApp").classList.add("hidden");
  $("adminLogin")?.classList.add("hidden");
  $("denied").classList.remove("hidden");
}
async function check() {
  if (!sb) return showDenied();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    $("checking").classList.add("hidden");
    $("denied").classList.add("hidden");
    $("adminLogin")?.classList.remove("hidden");
    return;
  }
  adminUser = session.user;
  const { data: p } = await sb
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();
  if (p?.role !== "admin") {
    await sb.auth.signOut();
    $("checking").classList.add("hidden");
    $("adminApp").classList.add("hidden");
    $("denied").classList.add("hidden");
    $("adminLogin")?.classList.remove("hidden");
    if ($("adminLoginMsg"))
      $("adminLoginMsg").textContent =
        "This account does not have the admin role.";
    return;
  }
  $("checking").classList.add("hidden");
  $("adminLogin")?.classList.add("hidden");
  $("denied").classList.add("hidden");
  $("adminApp").classList.remove("hidden");
  await loadProducts();
  await loadOrders();
  await loadNotifications();
}
async function loadReviews() {
  const box = $("adminReviews"); if (!box || !sb) return;
  box.innerHTML = '<p class="muted">Loading customer reviews…</p>';
  const { data, error } = await sb.from("product_reviews")
    .select("id,product_id,user_id,rating,review_text,status,created_at,products(name)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) { box.innerHTML = `<p class="muted">Could not load reviews: ${esc(error.message)}</p>`; return; }
  if (!data?.length) { box.innerHTML = '<div class="summary"><p>No customer reviews have been submitted yet.</p></div>'; return; }
  box.innerHTML = data.map(r => `<article class="adminReviewCard"><div class="reviewCardHead"><b>${esc(r.products?.name || "Product")}</b><span class="reviewStars">${"★".repeat(Number(r.rating))}${"☆".repeat(5-Number(r.rating))}</span></div><p>${esc(r.review_text)}</p><small class="muted">${esc(r.status)} · ${new Date(r.created_at).toLocaleString()} · Customer ${esc(String(r.user_id).slice(0,8))}</small><div class="adminReviewActions">${r.status !== "approved" ? `<button class="approveReview" type="button" data-review-approve="${r.id}">Approve</button>` : ""}${r.status !== "rejected" ? `<button class="rejectReview" type="button" data-review-reject="${r.id}">Reject</button>` : ""}</div></article>`).join("");
}
async function moderateReview(id, status) {
  const { error } = await sb.from("product_reviews").update({status}).eq("id", id);
  if (error) { alert("Could not update review: " + error.message); return; }
  await loadReviews();
}
async function loadRewardsAdmin() {
  const box = $("adminRewards");
  if (!box || !sb) return;
  box.innerHTML = '<p class="muted">Loading customer rewards…</p>';
  const { data: accounts, error } = await sb.from("loyalty_accounts")
    .select("user_id,points_balance,updated_at")
    .order("points_balance", { ascending: false }).limit(200);
  if (error) { box.innerHTML = `<p class="muted">Could not load rewards: ${esc(error.message)}</p>`; return; }
  if (!accounts?.length) { box.innerHTML = '<div class="summary">No customers have earned rewards points yet.</div>'; return; }
  const ids = accounts.map(a => a.user_id);
  const { data: profiles } = await sb.from("profiles").select("id,full_name,phone").in("id", ids);
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  box.innerHTML = accounts.map(a => {
    const p = profileMap.get(a.user_id) || {};
    return `<article class="summary adminRewardCard"><b>${esc(p.full_name || "Customer")}</b><p>${esc(p.phone || "No phone saved")}</p><strong>${Number(a.points_balance || 0).toLocaleString("en-NG")} points</strong><small class="muted">Updated ${a.updated_at ? new Date(a.updated_at).toLocaleString() : "—"}</small></article>`;
  }).join("");
}


async function loadAnalytics() {
  const box = $("adminAnalytics");
  if (!box || !sb) return;
  box.innerHTML = '<p class="muted">Loading your store analytics…</p>';

  // Read-only reporting: this section never writes to orders, payments or products.
  const [ordersResult, itemsResult] = await Promise.all([
    sb.from("orders")
      .select("id,total,payment_status,order_status,created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    sb.from("order_items")
      .select("order_id,product_name,quantity,product_price")
      .limit(10000),
  ]);

  if (ordersResult.error) {
    box.innerHTML = `<div class="summary"><b>Could not load sales analytics.</b><p>${esc(ordersResult.error.message)}</p><p class="muted">Check that the admin account has permission to read the orders table.</p></div>`;
    return;
  }

  const orders = ordersResult.data || [];
  const paidOrders = orders.filter(o => String(o.payment_status || "").toLowerCase() === "paid");
  const moneyTotal = rows => rows.reduce((sum, o) => sum + Math.max(0, Number(o.total) || 0), 0);
  const totalRevenue = moneyTotal(paidOrders);
  const now = new Date();
  const todayKey = dateKeyForAnalytics(now);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const recentStart = new Date(now);
  recentStart.setHours(0, 0, 0, 0);
  recentStart.setDate(recentStart.getDate() - 6);
  const recentStartKey = dateKeyForAnalytics(recentStart);
  const paidToday = paidOrders.filter(o => dateKeyForAnalytics(o.created_at) === todayKey);
  const paidThisMonth = paidOrders.filter(o => String(o.created_at || "").slice(0, 7) === monthKey);
  const paidLastSevenDays = paidOrders.filter(o => {
    const key = dateKeyForAnalytics(o.created_at);
    return key && key >= recentStartKey && key <= todayKey;
  });
  const pendingOrders = orders.filter(o => {
    const status = String(o.order_status || "processing").toLowerCase();
    return !["delivered", "cancelled"].includes(status);
  });
  const failedPayments = orders.filter(o => String(o.payment_status || "").toLowerCase() === "failed");

  const daily = [];
  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const key = dateKeyForAnalytics(day);
    daily.push({
      key,
      label: day.toLocaleDateString("en-NG", { weekday: "short" }),
      value: moneyTotal(paidOrders.filter(o => dateKeyForAnalytics(o.created_at) === key)),
    });
  }
  const maxDaily = Math.max(1, ...daily.map(d => d.value));
  const dailyHtml = daily.map(d => {
    const height = d.value > 0 ? Math.max(8, Math.round((d.value / maxDaily) * 112)) : 5;
    return `<div class="analyticsBarCol"><span class="analyticsBarValue">${d.value ? money(d.value) : "₦0"}</span><div class="analyticsBar" style="height:${height}px" title="${esc(d.label)}: ${money(d.value)}"></div><span class="analyticsBarLabel">${esc(d.label)}</span></div>`;
  }).join("");

  let topProductsHtml = "";
  if (itemsResult.error) {
    topProductsHtml = `<p class="muted">Best-selling products could not be loaded: ${esc(itemsResult.error.message)}</p>`;
  } else {
    const paidIds = new Set(paidOrders.map(o => o.id));
    const productTotals = new Map();
    (itemsResult.data || []).forEach(item => {
      if (!paidIds.has(item.order_id)) return;
      const name = String(item.product_name || "Unnamed product");
      const quantity = Math.max(0, Number(item.quantity) || 0);
      const unitPrice = Math.max(0, Number(item.product_price) || 0);
      const current = productTotals.get(name) || { quantity: 0, revenue: 0 };
      current.quantity += quantity;
      current.revenue += quantity * unitPrice;
      productTotals.set(name, current);
    });
    const top = [...productTotals.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 5);
    topProductsHtml = top.length
      ? top.map(([name, stats], index) => `<div class="analyticsTopRow"><b>${index + 1}. ${esc(name)}</b><span>${stats.quantity.toLocaleString("en-NG")} sold</span><strong>${money(stats.revenue)}</strong></div>`).join("")
      : '<p class="muted">No products from paid orders are available yet.</p>';
  }

  box.innerHTML = `
    <div class="analyticsIntro">
      <div><h2>📊 Sales Analytics</h2><p>Store performance based on recorded orders and successful payments.</p></div>
      <button class="secondary" type="button" id="refreshSalesAnalytics">↻ Refresh Analytics</button>
    </div>
    <div class="analyticsNotice">Revenue includes orders marked <b>paid</b>. Pending orders are orders not yet marked delivered or cancelled. Figures reflect the order records returned by Supabase.</div>
    <div class="analyticsGrid">
      <article class="analyticsMetric"><span>Total Revenue</span><strong>${money(totalRevenue)}</strong></article>
      <article class="analyticsMetric"><span>Total Orders</span><strong>${orders.length.toLocaleString("en-NG")}</strong></article>
      <article class="analyticsMetric"><span>Pending Orders</span><strong>${pendingOrders.length.toLocaleString("en-NG")}</strong></article>
      <article class="analyticsMetric"><span>Failed Payments</span><strong>${failedPayments.length.toLocaleString("en-NG")}</strong></article>
      <article class="analyticsMetric"><span>Revenue Today</span><strong>${money(moneyTotal(paidToday))}</strong></article>
      <article class="analyticsMetric"><span>Revenue · Last 7 Days</span><strong>${money(moneyTotal(paidLastSevenDays))}</strong></article>
      <article class="analyticsMetric"><span>Revenue · This Month</span><strong>${money(moneyTotal(paidThisMonth))}</strong></article>
      <article class="analyticsMetric"><span>Successful Payments</span><strong>${paidOrders.length.toLocaleString("en-NG")}</strong></article>
    </div>
    <section class="analyticsPanel"><h3>Revenue · Last 7 Days</h3><div class="analyticsBars">${dailyHtml}</div></section>
    <section class="analyticsPanel"><h3>🏆 Best-selling Products</h3>${topProductsHtml}</section>
    ${orders.length === 0 ? '<div class="summary"><p>No orders have been recorded yet. Analytics will appear here when customers place orders.</p></div>' : ''}
  `;
  $("refreshSalesAnalytics")?.addEventListener("click", loadAnalytics);
}

function dateKeyForAnalytics(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function loadNotifications() {
  const box = $("adminMessages");
  if (!box || !sb || !adminUser) return;
  const { data, error } = await sb
    .from("notifications")
    .select("id,title,message,type,order_id,read_at,created_at")
    .eq("recipient_user_id", adminUser.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    box.innerHTML =
      '<p class="notificationEmpty">Could not load notifications: ' +
      esc(error.message) +
      "</p>";
    return;
  }
  const rows = data || [];
  $("adminUnreadCount").textContent = String(
    rows.filter((n) => !n.read_at).length
  );
  if (!rows.length) {
    box.innerHTML =
      '<p class="notificationEmpty">No admin notifications yet. New orders and customer payment reports will appear here.</p>';
    return;
  }
  box.innerHTML = `<div class="adminNotificationActions"><button class="secondary" type="button" data-clear-all-admin-notifications>Clear All Notifications</button></div> ${rows .map( (n) => `<article class="notificationItem ${n.read_at ? "" : "unread"}"> <span aria-hidden="true">${ n.type === "new_order" ? "🛍️" : n.type === "payment_reported" ? "💳" : "🔔" }</span> <div class="notificationText"><b>${esc(n.title)}</b><p>${esc( n.message )}</p><small>${new Date(n.created_at).toLocaleString()}</small></div> ${ n.order_id ? `<button class="secondary" type="button" data-order="${esc( n.order_id )}">Open order</button>` : "" } ${ !n.read_at ? `<button class="secondary" type="button" data-read-notification="${esc( n.id )}">Mark read</button>` : "" } <button class="secondary" type="button" data-clear-admin-notification="${esc( n.id )}">Clear</button></article>` ) .join("")}`;
  box
    .querySelectorAll("[data-clear-admin-notification]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          clearAdminNotification(b.dataset.clearAdminNotification))
    );
  const clearAll = box.querySelector("[data-clear-all-admin-notifications]");
  if (clearAll) clearAll.onclick = clearAllAdminNotifications;
}
async function clearAdminNotification(id) {
  if (
    !confirm(
      "Clear this notification only? The order and delivery history will remain."
    )
  )
    return;
  const { error } = await sb
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("recipient_user_id", adminUser.id);
  if (error) {
    alert("Could not clear notification: " + error.message);
    return;
  }
  await loadNotifications();
}
async function clearAllAdminNotifications() {
  if (
    !confirm(
      "Clear all notifications for your admin account? Orders and delivery history will remain."
    )
  )
    return;
  const { error } = await sb
    .from("notifications")
    .delete()
    .eq("recipient_user_id", adminUser.id);
  if (error) {
    alert("Could not clear notifications: " + error.message);
    return;
  }
  await loadNotifications();
}
async function markNotificationRead(id) {
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_user_id", adminUser.id);
  if (error) return alert(error.message);
  await loadNotifications();
}
async function loadProducts() {
  const { data, error } = await sb.from("products").select("*").order("created_at", { ascending: false });
  if (error) {
    ["adminProducts", "adminChickenProducts", "adminSolarProducts"].forEach(id => { if ($(id)) $(id).innerHTML = `<div class="summary">${esc(error.message)}</div>`; });
    return;
  }
  adminProductsCache = data || [];
  renderAdminProducts();
}
function renderAdminProductList(department, targetId) {
  const host = $(targetId); if (!host) return;
  const rows = adminProductsCache.filter(p => (p.department || "general") === department).map(p =>
    `<div class="adminRow"><img src="${esc(img(p.image_url))}" alt=""><div><b>${esc(p.name)}</b><div class="muted">${esc(p.category || "")}</div></div><div>${money(p.price)}</div><div>${p.stock}</div><div>${p.active ? "Live" : "Hidden"}</div><div><button class="secondary" data-edit="${p.id}">Edit</button> <button class="danger" data-delete="${p.id}">Delete</button></div></div>`
  ).join("");
  host.innerHTML = `<div class="adminTable"><div class="adminRow"><b>Image</b><b>Product</b><b>Price</b><b>Stock</b><b>Status</b><b>Actions</b></div>${rows || '<div class="summary">No products in this department yet.</div>'}</div>`;
}
function renderAdminProducts() {
  renderAdminProductList("general", "adminProducts");
  renderAdminProductList("chicken", "adminChickenProducts");
  renderAdminProductList("solar", "adminSolarProducts");
}
async function loadOrders() {
  const { data, error } = await sb
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    $("adminOrders").innerHTML =
      '<div class="summary">' + esc(error.message) + "</div>";
    return;
  }
  $("adminOrders").innerHTML =
    (data || [])
      .map((o) => {
        const expected = o.expected_delivery_date
          ? new Date(`${o.expected_delivery_date}T00:00:00`).toLocaleDateString("en-NG", { dateStyle: "medium" })
          : "Not set";
        return `<div class="orderCard"><b>Order ${o.id.slice(0, 8)}</b> <p>${esc(o.customer_name)} · ${esc(o.customer_phone)} · ${money(o.total)}</p> <p>Payment: <span class="status">${esc(o.payment_status)}</span> · Shipment: <span class="status">${esc(o.order_status)}</span></p> <p>Expected delivery: <b>${esc(expected)}</b></p><p>Tracking: ${esc(o.tracking_number || "Not assigned")}</p><p>Address: ${esc(o.delivery_address)}</p>${specialRequestHtml(o)}${rewardsInfoHtml(o)} <button class="primary" data-order="${o.id}">Manage Order & Shipment</button></div>`;
      })
      .join("") || '<div class="summary">No orders yet.</div>';
}
function openProduct(p, defaultDepartment = "general") {
  $("productModalTitle").textContent = p ? "Edit Product" : "Add Product";
  $("productId").value = p?.id || "";
  $("productName").value = p?.name || "";
  $("productDepartment").value = p?.department || defaultDepartment;
  $("productDepartment").disabled = true;
  $("productPolicyWrap")?.classList.toggle("hidden", !["chicken", "solar"].includes($("productDepartment").value));
  $("productCategory").value = p?.category || "Solar";
  $("productPrice").value = p?.price ?? "";
  $("productStock").value = p?.stock ?? 0;
  $("productDescription").value = p?.description || "";
  $("productPolicy").value = p?.policy || "";
  $("productSizes").value = Array.isArray(p?.sizes) ? p.sizes.join(", ") : "";
  $("productColors").value = Array.isArray(p?.colors)
    ? p.colors.join(", ")
    : "";
  $("productImage").value = "";
  const imgs = Array.isArray(p?.images)
    ? p.images
    : p?.image_url
    ? [p.image_url]
    : [];
  $("imagePreview").innerHTML = imgs
    .map(
      (u) =>
        `<img class="preview" style="max-width:90px;margin:4px" src="${esc( u )}">`
    )
    .join("");
  $("productMsg").textContent = "";
  $("productModal").classList.remove("hidden");
}
async function saveProduct(e) {
  e.preventDefault();
  const id = $("productId").value,
    files = Array.from($("productImage").files || []);
  const { data: old } = id
    ? await sb.from("products").select("image_url,images").eq("id", id).single()
    : { data: null };
  let imageUrls = Array.isArray(old?.images)
    ? [...old.images]
    : old?.image_url
    ? [old.image_url]
    : [];
  if (files.length) {
    imageUrls = [];
    for (const file of files) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase(),
        path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage
        .from("product-images")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) {
        $("productMsg").textContent = error.message;
        return;
      }
      imageUrls.push(
        sb.storage.from("product-images").getPublicUrl(path).data.publicUrl
      );
    }
  }
  const parseList = (v) => [
    ...new Set(
      String(v || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    ),
  ];
  const payload = {
    name: $("productName").value.trim(),
    department: $("productDepartment").value,
    category: $("productCategory").value.trim(),
    price: Number($("productPrice").value),
    stock: Number($("productStock").value),
    description: $("productDescription").value.trim(),
    policy: ["chicken", "solar"].includes($("productDepartment").value) ? $("productPolicy").value.trim() : null,
    sizes: parseList($("productSizes").value),
    colors: parseList($("productColors").value),
  };
  if (imageUrls.length) {
    payload.images = imageUrls;
    payload.image_url = imageUrls[0];
  }
  const r = id
    ? await sb.from("products").update(payload).eq("id", id)
    : await sb.from("products").insert(payload);
  if (r.error) {
    $("productMsg").textContent =
      r.error.message +
      " If it mentions images, sizes or colors, run the supplied Supabase SQL setup first.";
    return;
  }
  $("productModal").classList.add("hidden");
  await loadProducts();
}
async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) alert(error.message);
  else loadProducts();
}
let baAdminShipmentMap = null;
let baAdminShipmentMarker = null;
function setupAdminShipmentMap() {
  const toggle = $("toggleShipmentMap");
  const panel = $("shipmentMapPanel");
  if (!toggle || !panel) return;
  toggle.onclick = () => {
    panel.classList.toggle("hidden");
    toggle.textContent = panel.classList.contains("hidden") ? "＋ Add map location (optional)" : "− Hide map location";
    if (!panel.classList.contains("hidden")) {
      if (!window.L) return alert("The map could not load. Please check your internet connection and try again.");
      if (!baAdminShipmentMap) {
        baAdminShipmentMap = L.map("adminShipmentMap").setView([9.082, 8.675], 6);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(baAdminShipmentMap);
        baAdminShipmentMap.on("click", (event) => setAdminShipmentPin(event.latlng.lat, event.latlng.lng));
      }
      setTimeout(() => baAdminShipmentMap.invalidateSize(), 120);
    }
  };
  const search = async () => {
    const query = $("shipmentMapSearch").value.trim();
    if (!query) return alert("Enter a place to search for.");
    try {
      const response = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(query));
      const results = await response.json();
      if (!results.length) return alert("Location not found. Try a nearby town, area or landmark, or tap the map.");
      const lat = Number(results[0].lat), lng = Number(results[0].lon);
      baAdminShipmentMap.setView([lat, lng], 15);
      setAdminShipmentPin(lat, lng);
    } catch (error) { alert("Could not search for that location. You can tap the map to place the marker."); }
  };
  $("searchShipmentMap").onclick = search;
  $("shipmentMapSearch").onkeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); search(); } };
  $("clearShipmentMap").onclick = () => {
    if (baAdminShipmentMarker) baAdminShipmentMap.removeLayer(baAdminShipmentMarker);
    baAdminShipmentMarker = null;
    $("mMapLat").value = ""; $("mMapLng").value = "";
    $("shipmentMapSelected").textContent = "No map location selected.";
  };
}
function setAdminShipmentPin(lat, lng) {
  $("mMapLat").value = Number(lat).toFixed(6);
  $("mMapLng").value = Number(lng).toFixed(6);
  if (baAdminShipmentMarker) baAdminShipmentMarker.setLatLng([lat, lng]);
  else baAdminShipmentMarker = L.circleMarker([lat, lng], { radius: 9, color: "#ffffff", weight: 3, fillColor: "#16a34a", fillOpacity: 1 }).addTo(baAdminShipmentMap);
  $("shipmentMapSelected").textContent = `Confirmed map pin: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

async function manageOrder(id) {
  const { data: o, error } = await sb
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return alert(error.message);
  const { data: orderItems, error: itemsError } = await sb
    .from("order_items")
    .select("*")
    .eq("order_id", id);
  const orderedProductsHtml = itemsError
    ? `<p class="muted">Could not load ordered products: ${esc( itemsError.message )}. Check the order_items table permissions (RLS) in Supabase.</p>`
    : (orderItems || [])
        .map(
          ( item ) => `<div class="summary" style="display:flex;gap:12px;align-items:flex-start;margin:10px 0"> ${ item.image_url ? `<img src="${esc(item.image_url)}" alt="${esc( item.product_name || "Product" )}" style="width:84px;height:84px;object-fit:contain;border-radius:8px">` : "" } <div><b>${esc(item.product_name || "Product")}</b><p>Quantity: ${ Number(item.quantity) || 0 } · Unit price: ${money(item.product_price)}</p> ${item.size ? `<p>Size: ${esc(item.size)}</p>` : ""}${ item.color ? `<p>Color: ${esc(item.color)}</p>` : "" }</div></div>`
        )
        .join("") ||
      '<p class="muted">No order items are saved for this order. If this is an older order, its items may not have been saved; a new test order will confirm checkout.</p>';
  const { data: ups } = await sb
    .from("shipment_updates")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false });
  $("orderModalBody").innerHTML = `<h2>Manage Order ${id.slice(0, 8)}</h2><p>${esc(o.customer_name)} · ${esc(o.customer_phone)}</p><p>${esc(o.delivery_address)}</p>${specialRequestHtml(o)}<h3>Payment & Rewards</h3>${rewardsInfoHtml(o)}<h3>Ordered products</h3>${orderedProductsHtml}<label>Payment status<select id="mPay"><option ${o.payment_status === "pending" ? "selected" : ""}>pending</option><option ${o.payment_status === "paid" ? "selected" : ""}>paid</option><option ${o.payment_status === "failed" ? "selected" : ""}>failed</option><option ${o.payment_status === "refunded" ? "selected" : ""}>refunded</option></select></label><label>Shipment status<select id="mStatus">${["processing", "confirmed", "shipped", "out_for_delivery", "delivered", "cancelled"].map(s => `<option value="${s}" ${o.order_status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Expected delivery date<input id="mExpectedDelivery" type="date" value="${esc(o.expected_delivery_date || "")}"></label><label>Tracking number<input id="mTrack" value="${esc(o.tracking_number || "")}" placeholder="Enter carrier tracking number"></label><label>Tracking website link<input id="mTrackingUrl" type="url" value="${esc(o.tracking_url || "")}" placeholder="https://carrier.com/track/..."></label><p class="muted">Paste the carrier's full tracking URL. Customers will be able to tap their tracking number to open it.</p><label>Shipment update<textarea id="mMessage" placeholder="e.g. Package has left Abuja sorting centre"></textarea></label><label>Location<input id="mLocation" placeholder="e.g. Abuja"></label><div class="baMapPicker"><button type="button" class="secondary" id="toggleShipmentMap">＋ Add map location (optional)</button><div id="shipmentMapPanel" class="hidden"><p class="muted">Search for the driver's confirmed location or tap the map to place the green marker. You can leave this empty.</p><div class="baMapSearch"><input id="shipmentMapSearch" type="search" placeholder="Search a place, area or address"><button type="button" class="secondary" id="searchShipmentMap">Search</button><button type="button" class="secondary" id="clearShipmentMap">Clear</button></div><div id="adminShipmentMap" class="baShipmentMap"></div><small id="shipmentMapSelected" class="muted">No map location selected.</small><input type="hidden" id="mMapLat"><input type="hidden" id="mMapLng"></div></div><button class="primary" id="saveOrder">Save Update</button><h3>Shipment history</h3>${(ups || []).map(u => `<div class="summary">📍 <b>${esc(u.status)}</b> — ${esc(u.message)}<br><span class="muted">${esc(u.location || "")} ${new Date(u.created_at).toLocaleString()}</span></div>`).join("") || '<p class="muted">No shipment updates yet.</p>'}`;
  $("saveOrder").onclick = async () => {
    const nextStatus = $("mStatus").value;
    const trackingUrlInput = $("mTrackingUrl").value.trim();
    let normalizedTrackingUrl = null;
    if (trackingUrlInput) {
      try {
        const parsedTrackingUrl = new URL(trackingUrlInput);
        if (!["http:", "https:"].includes(parsedTrackingUrl.protocol)) throw new Error("Use an http or https tracking link.");
        normalizedTrackingUrl = parsedTrackingUrl.href;
      } catch (urlError) {
        return alert("Please enter a valid tracking website link starting with https://");
      }
    }
    const orderUpdate = {
      payment_status: $("mPay").value,
      order_status: nextStatus,
      expected_delivery_date: $("mExpectedDelivery").value || null,
      tracking_number: $("mTrack").value.trim() || null,
      tracking_url: normalizedTrackingUrl,
    };
    // Record the first time the order is marked delivered. Do not restart the 3-day window on later edits.
    if (nextStatus === "delivered" && !o.delivered_at) {
      orderUpdate.delivered_at = new Date().toISOString();
    }
    const { error } = await sb
      .from("orders")
      .update(orderUpdate)
      .eq("id", id);
    if (error) return alert(error.message);
    let rewardsNotice = "";
    if ($("mPay").value === "paid" && $("mStatus").value === "delivered") {
      const { data: awarded, error: rewardsError } = await sb.rpc("award_loyalty_points", { p_order_id: id });
      if (rewardsError) {
        console.error("BIG ALIEN rewards award error:", rewardsError);
        rewardsNotice = " Order status saved, but rewards points could not be awarded: " + rewardsError.message;
      } else if (Number(awarded) > 0) {
        rewardsNotice = ` ${awarded} BIG ALIEN reward points awarded.`;
      }
    }
    const shipmentMessage = $("mMessage").value.trim() || ($("mMapLat").value ? "Location confirmed by BIG ALIEN." : "");
    if (shipmentMessage) {
      const { error: e } = await sb
        .from("shipment_updates")
        .insert({
          order_id: id,
          status: $("mStatus").value,
          message: shipmentMessage,
          location: $("mLocation").value.trim() || null,
          latitude: $("mMapLat").value ? Number($("mMapLat").value) : null,
          longitude: $("mMapLng").value ? Number($("mMapLng").value) : null,
        });
      if (e) return alert(e.message);
      const { error: notifyError } = await sb
        .from("notifications")
        .insert({
          recipient_user_id: o.user_id,
          order_id: id,
          title: "Shipment update",
          message: `Order ${id.slice(0, 8)}: ${shipmentMessage}`,
          type: "shipment_update",
        });
      if (notifyError) return alert(notifyError.message);
      // Customer email is triggered only for an actual shipment update, never for a new order.
      const { error: emailError } = await sb.functions.invoke(
        "notify-admin-order",
        { body: { event: "shipment_update", order_id: id } }
      );
      if (emailError) {
        console.error("Customer shipment email error:", emailError);
        alert(
          "Shipment saved, but the email could not be sent. Check the notify-admin-order function logs."
        );
      }
    }
    $("orderModal").classList.add("hidden");
    await loadOrders();
    alert("Order updated. The customer will see the new shipment status." + rewardsNotice);
  };
  $("orderModal").classList.remove("hidden");
  setupAdminShipmentMap();
}

const ADMIN_AVATAR_BUCKET = "admin-avatars";

async function loadAdminSettings() {
  if (!adminUser || !sb) return;
  $("adminAccountEmail").textContent = adminUser.email || "Email unavailable";
  $("adminAccountId").textContent = adminUser.id;
  $("adminAvatarMsg").textContent = "Loading your private profile photo…";
  const { data, error } = await sb.storage.from(ADMIN_AVATAR_BUCKET).createSignedUrl(`${adminUser.id}/avatar`, 3600);
  if (data?.signedUrl) {
    $("adminAvatarPreview").src = data.signedUrl;
    $("adminAvatarMsg").textContent = "Your private profile photo is loaded.";
    $("removeAdminAvatar").disabled = false;
  } else {
    $("adminAvatarPreview").src = "images/logo.png";
    $("adminAvatarMsg").textContent = error ? "No profile photo saved yet. Upload one below after the private storage setup." : "No profile photo saved yet.";
    $("removeAdminAvatar").disabled = true;
  }
}
$("adminAvatarFile")?.addEventListener("change", async () => {
  const file = $("adminAvatarFile").files?.[0];
  if (!file || !adminUser) return;
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { $("adminAvatarMsg").textContent = "Choose a PNG, JPG or WebP image."; return; }
  if (file.size > 3 * 1024 * 1024) { $("adminAvatarMsg").textContent = "Image must be 3 MB or smaller."; return; }
  $("adminAvatarMsg").textContent = "Uploading your private photo…";
  const { error } = await sb.storage.from(ADMIN_AVATAR_BUCKET).upload(`${adminUser.id}/avatar`, file, {upsert:true,contentType:file.type,cacheControl:"3600"});
  if (error) { $("adminAvatarMsg").textContent = `Upload failed: ${error.message}. Check the private avatar storage setup.`; return; }
  await loadAdminSettings();
  $("adminAvatarMsg").textContent = "Profile picture updated. It is private to your admin account.";
});
$("removeAdminAvatar")?.addEventListener("click", async () => {
  if (!adminUser || !confirm("Remove your admin profile picture?")) return;
  const { error } = await sb.storage.from(ADMIN_AVATAR_BUCKET).remove([`${adminUser.id}/avatar`]);
  if (error) { $("adminAvatarMsg").textContent = `Could not remove photo: ${error.message}`; return; }
  $("adminAvatarPreview").src = "images/logo.png";
  $("adminAvatarMsg").textContent = "Profile picture removed.";
  $("removeAdminAvatar").disabled = true;
});
$("adminPasswordForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = $("adminNewPassword").value;
  const msg = $("adminPasswordMsg");
  if (password.length < 8) { msg.textContent = "Use at least 8 characters."; return; }
  if (password !== $("adminConfirmPassword").value) { msg.textContent = "The passwords do not match."; return; }
  msg.textContent = "Updating password…";
  const { error } = await sb.auth.updateUser({password});
  if (error) { msg.textContent = `Password was not changed: ${error.message}`; return; }
  $("adminPasswordForm").reset();
  msg.textContent = "Your admin password has been updated successfully.";
});

document.addEventListener("click", async (e) => {
  const t = e.target.closest("button") || e.target;
  if (t.dataset.readNotification) {
    await markNotificationRead(t.dataset.readNotification);
    return;
  }
  if (t.dataset.tab) {
    document
      .querySelectorAll("[data-tab]")
      .forEach((x) => x.classList.toggle("active", x === t));
    $("productsTab").classList.toggle("hidden", t.dataset.tab !== "products");
    $("chickenTab").classList.toggle("hidden", t.dataset.tab !== "chicken");
    $("solarTab").classList.toggle("hidden", t.dataset.tab !== "solar");
    $("ordersTab").classList.toggle("hidden", t.dataset.tab !== "orders");
    $("reviewsTab").classList.toggle("hidden", t.dataset.tab !== "reviews");
    $("rewardsTab").classList.toggle("hidden", t.dataset.tab !== "rewards");
    $("analyticsTab").classList.toggle("hidden", t.dataset.tab !== "analytics");
    $("settingsTab").classList.toggle("hidden", t.dataset.tab !== "settings");
    if (t.dataset.tab === "settings") await loadAdminSettings();
    if (t.dataset.tab === "reviews") await loadReviews();
    if (t.dataset.tab === "rewards") await loadRewardsAdmin();
    if (t.dataset.tab === "analytics") await loadAnalytics();
  }
  if (t.dataset.reviewApprove) await moderateReview(t.dataset.reviewApprove, "approved");
  if (t.dataset.reviewReject) await moderateReview(t.dataset.reviewReject, "rejected");
  if (t.id === "addGeneralProductBtn") openProduct(null, "general");
  if (t.id === "addChickenProductBtn") openProduct(null, "chicken");
  if (t.id === "addSolarProductBtn") openProduct(null, "solar");
  if (t.dataset.edit) {
    const { data } = await sb
      .from("products")
      .select("*")
      .eq("id", t.dataset.edit)
      .single();
    if (data) openProduct(data);
  }
  if (t.dataset.delete) deleteProduct(t.dataset.delete);
  if (t.dataset.order) manageOrder(t.dataset.order);
  if (t.dataset.close) $(t.dataset.close).classList.add("hidden");
});
if ($("adminMessagesBtn"))
  $("adminMessagesBtn").onclick = async () => {
    $("adminMessagesPanel").classList.toggle("hidden");
    await loadNotifications();
  };
if ($("refreshAdminMessages"))
  $("refreshAdminMessages").onclick = loadNotifications;
$("productImage")?.addEventListener("change", () => {
  const files = Array.from($("productImage").files || []);
  $("imagePreview").innerHTML = files
    .map(
      (file) =>
        `<img class="preview" style="max-width:90px;margin:4px" src="${URL.createObjectURL( file )}" alt="${esc(file.name)}">`
    )
    .join("");
});
$("productForm").onsubmit = saveProduct;
if ($("adminLoginForm"))
  $("adminLoginForm").onsubmit = async (e) => {
    e.preventDefault();
    $("adminLoginMsg").textContent = "Signing in…";
    const { error } = await sb.auth.signInWithPassword({
      email: $("adminLoginEmail").value.trim(),
      password: $("adminLoginPassword").value,
    });
    if (error) {
      $("adminLoginMsg").textContent = error.message;
      return;
    }
    $("adminLoginMsg").textContent = "";
    $("checking").classList.remove("hidden");
    $("adminLogin").classList.add("hidden");
    await check();
  };
if ($("deniedLoginAgain"))
  $("deniedLoginAgain").onclick = async () => {
    await sb.auth.signOut();
    $("denied").classList.add("hidden");
    $("adminLogin").classList.remove("hidden");
  };
$("adminLogout").onclick = async () => {
  await sb.auth.signOut();
  location.href = "./";
};
$("backHome").onclick = () => (location.href = "./");
$("deniedLogin").onclick = () => (location.href = "./");
check();
