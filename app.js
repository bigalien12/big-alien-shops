const cfg = window.BIG_ALIEN_CONFIG || {};
const ready =
  cfg.SUPABASE_URL &&
  !cfg.SUPABASE_URL.includes("PASTE_") &&
  cfg.SUPABASE_PUBLISHABLE_KEY &&
  !cfg.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");
let sb = null,
  user = null,
  profile = null,
  products = [],
  cart = JSON.parse(localStorage.getItem("big_alien_cart") || "[]"),
  category = "All",
  query = "";
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
function saveCart() {
  localStorage.setItem("big_alien_cart", JSON.stringify(cart));
  $("cartCount").textContent = cart.reduce((a, x) => a + x.qty, 0);
}
let currentView = null;
const viewHistory = [];

function show(id, remember = true) {
  // A deliberate return to the marketplace starts a fresh customer navigation path.
  if (id === "homeView" && remember) viewHistory.length = 0;
  if (remember && currentView && currentView !== id) {
    viewHistory.push(currentView);
    // Keep history bounded during long shopping sessions.
    if (viewHistory.length > 50) viewHistory.shift();
  }
  currentView = id;

  // The search field and category strip should appear only on the marketplace.
  document.body.classList.toggle("marketplace-view", id === "homeView");

  const pageBackBtn = $("pageBackBtn");
  if (pageBackBtn) {
    pageBackBtn.classList.toggle(
      "hidden",
      ["homeView", "authView", "otpView", "adminView"].includes(id)
    );
  }

  document.body.classList.toggle(
    "account-area",
    [
      "profileView",
      "customerInboxView",
      "accountManagementView",
      "personalDetailsView",
      "deliveryAddressView",
      "emailSettingsView",
      "passwordSettingsView",
      "reviewsView",
      "supportView",
    ].includes(id)
  );
  [
    "authView",
    "otpView",
    "homeView",
    "productView",
    "cartView",
    "checkoutView",
    "ordersView",
    "wishlistView",
    "profileView",
    "customerInboxView",
    "accountManagementView",
    "personalDetailsView",
    "deliveryAddressView",
    "emailSettingsView",
    "passwordSettingsView",
    "reviewsView",
    "supportView",
    "adminView",
  ].forEach((viewId) => {
    const view = $(viewId);
    if (view) view.classList.toggle("hidden", viewId !== id);
  });
  const nav = $("bottomNav");
  if (nav) {
    nav.classList.toggle(
      "hidden",
      ["authView", "otpView", "adminView"].includes(id)
    );
    nav.querySelectorAll("button").forEach((button) => {
      button.classList.toggle(
        "active",
        (id === "homeView" && button.dataset.view === "home") ||
          ([
            "profileView",
            "customerInboxView",
            "accountManagementView",
            "personalDetailsView",
            "deliveryAddressView",
            "emailSettingsView",
            "passwordSettingsView",
            "reviewsView",
            "supportView",
          ].includes(id) &&
            button.id === "bottomProfileBtn") ||
          (id === "cartView" && button.id === "bottomCartBtn") ||
          (id === "wishlistView" && button.id === "bottomWishlistBtn")
      );
    });
  }
}
function msg(id, t, ok = false) {
  $(id).textContent = t;
  $(id).style.color = ok ? "#147a32" : "#b00020";
}
function getWishlist() {
  try {
    return JSON.parse(
      localStorage.getItem(`big_alien_wishlist_${user?.id || "guest"}`) || "[]"
    );
  } catch {
    return [];
  }
}
function renderWishlist() {
  const saved = getWishlist();
  const items = products.filter((p) => saved.includes(String(p.id)));
  if ($("wishlistEmpty"))
    $("wishlistEmpty").classList.toggle("hidden", items.length > 0);
  if ($("wishlistItems"))
    $("wishlistItems").innerHTML = items
      .map(
        (p) =>
          `<article class="card"><img src="${esc( imageOrFallback(p.image_url) )}" alt="${esc(p.name)}"><div class="cardBody"><h3>${esc( p.name )}</h3><div class="price">${money( p.price )}</div><button class="primary" data-product="${ p.id }">View / Buy</button><button class="secondary" data-wishlist-remove="${ p.id }">Remove</button></div></article>`
      )
      .join("");
}
function toggleWishlist(id) {
  const key = `big_alien_wishlist_${user?.id || "guest"}`;
  let list = getWishlist();
  id = String(id);
  list = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  localStorage.setItem(key, JSON.stringify(list));
  renderWishlist();
}
function imageOrFallback(url) {
  return url || "images/logo.png";
}
function renderCats() {
  let cats = ["All", ...new Set(products.map((p) => p.category))];
  $("categories").innerHTML = cats
    .map(
      (c) =>
        `<button class="${c === category ? "active" : ""}" data-cat="${esc( c )}">${esc(c)}</button>`
    )
    .join("");
}
function renderProducts() {
  let list = products.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      (!query ||
        `${p.name} ${p.description} ${p.category}`
          .toLowerCase()
          .includes(query.toLowerCase()))
  );
  $("resultCount").textContent = `${list.length} item(s)`;
  $("productGrid").innerHTML = list.length
    ? list
        .map(
          (p) =>
            `<article class="card"><img src="${esc( imageOrFallback(p.image_url) )}" alt="${esc( p.name )}"><div class="cardBody"><div class="muted">${esc( p.category )}</div><h3>${esc(p.name)}</h3><div class="price">${money( p.price )}</div><div class="stockBadge ${p.stock > 0 ? "inStock" : "outStock"}">${p.stock > 0 ? "● In Stock" : "Out of Stock"}</div><button class="primary" data-product="${p.id}" ${ p.stock < 1 ? "disabled" : "" }>View / Buy</button></div></article>`
        )
        .join("")
    : `<div class="summary"><h3>No products found</h3><p>Try another category or search.</p></div>`;
}
async function loadProducts() {
  if (!sb) return;
  let { data, error } = await sb
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    return;
  }
  products = data || [];
  renderCats();
  renderProducts();
}
function productById(id) {
  return products.find((p) => String(p.id) === String(id));
}
function openProduct(id) {
  let p = productById(id);
  if (!p) return;
  show("productView");
  $("productView").innerHTML = `<div class="productDetail"><div><img src="${esc( imageOrFallback(p.image_url) )}" alt="${esc(p.name)}"></div><div><div class="muted">${esc( p.category )}</div><h1>${esc(p.name)}</h1><div class="price">${money( p.price )}</div><p>${esc(p.description)}</p><div class="stockBadge ${p.stock > 0 ? "inStock" : "outStock"}">${p.stock > 0 ? "● In Stock" : "Out of Stock"}</div><label>Quantity<input id="buyQty" type="number" min="1" max="${ p.stock }" value="1"></label><button class="primary" id="addToCart" ${p.stock < 1 ? "disabled" : ""}>🛒 Add to Cart</button><button class="secondary" id="buyNow" ${p.stock < 1 ? "disabled" : ""}>Buy Now</button></div></div>`;
  $("addToCart").onclick = () => {
    let q = Number($("buyQty").value);
    addCart(p, q);
    show("cartView");
    renderCart();
  };
  $("buyNow").onclick = () => {
    let q = Number($("buyQty").value);
    addCart(p, q);
    show("checkoutView");
    prefillCheckout();
  };
}
function productStock(p, fallback = 0) {
  const raw = p?.stock ?? fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
function addCart(p, q) {
  if (!p) return;
  q = Math.max(1, Math.floor(Number(q) || 1));
  const stock = productStock(p);
  if (stock < 1) {
    alert("This product is currently out of stock. Please contact the store owner.");
    return;
  }
  const x = cart.find((item) => String(item.id) === String(p.id));
  const currentQty = x ? Math.max(0, Number(x.qty) || 0) : 0;
  const requestedQty = currentQty + q;
  if (requestedQty > stock) {
    alert(`Only ${stock} unit(s) of this product are currently available.`);
  }
  const allowedQty = Math.min(stock, requestedQty);
  if (x) {
    x.qty = allowedQty;
    x.stock = stock;
    x.price = Number(p.price ?? x.price) || 0;
    x.name = p.name || x.name;
    x.image_url = p.image_url || x.image_url;
  } else {
    cart.push({
      id: p.id,
      qty: Math.min(stock, q),
      name: p.name,
      price: Number(p.price) || 0,
      image_url: p.image_url,
      stock,
    });
  }
  saveCart();
  renderCart();
}
function renderCart() {
  if (!cart.length) {
    $("cartItems").innerHTML = `<div class="summary"><h3>Your cart is empty.</h3></div>`;
    $("cartSummary").innerHTML = "";
    return;
  }
  // Refresh each cart row's stock from the latest loaded product record.
  cart = cart.map((item) => {
    const product = productById(item.id);
    const stock = product ? productStock(product, item.stock) : productStock(item, 0);
    return { ...item, qty: Math.max(1, Number(item.qty) || 1), stock };
  });
  $("cartItems").innerHTML = cart.map((item) => {
    const stock = productStock(item, 0);
    const qty = Math.min(stock || Number(item.qty) || 1, Number(item.qty) || 1);
    return `<div class="cartRow"><img src="${esc(imageOrFallback(item.image_url))}" alt="${esc(item.name)}"><div class="cartProductInfo" style="flex:1;min-width:100px"><b>${esc(item.name)}</b><div>${money(item.price)} × ${qty}</div><small class="muted">${stock} available</small></div><button class="secondary" type="button" data-minus="${esc(item.id)}" aria-label="Decrease ${esc(item.name)} quantity" ${qty <= 1 ? "disabled" : ""}>−</button><b aria-label="Quantity">${qty}</b><button class="secondary" type="button" data-plus="${esc(item.id)}" aria-label="Increase ${esc(item.name)} quantity" ${stock <= qty ? "" : ""}>+</button><button class="danger" type="button" data-remove="${esc(item.id)}">Remove</button></div>`;
  }).join("");
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
const shippingFee = 3000;
const total = subtotal + shippingFee;

$("cartSummary").innerHTML = `
  <h3>Subtotal: ₦${subtotal.toLocaleString()}</h3>
  <p>Shipping fee: ₦${shippingFee.toLocaleString()}</p>
  <h3>Total: ₦${total.toLocaleString()}</h3>
  <button id="goToCheckoutBtn" class="primary" type="button" onclick="show('checkoutView')">
  Proceed to Checkout
</button>
`;  saveCart();
}
function checkoutReportKey() {
  const cartKey = cart
    .map((x) => `${x.id}:${x.qty}`)
    .sort()
    .join("|");
  return user && cartKey ? `bav_payment_report_${user.id}_${cartKey}` : "";
}
function setupCheckoutPaymentGate() {
  const form = $("checkoutForm");
  if (!form || $("bavPaymentGate")) return;
  const panel = document.createElement("div");
  panel.id = "bavPaymentGate";
  panel.className = "bankBox";
  panel.innerHTML = `<b>Bank transfer</b><p>Account name: Abel Philip<br>Account number: <span id="bavAccountNo">6714306196</span> <button class="secondary" type="button" id="bavCopyAccount">Copy</button><br>Bank: Moniepoint MFB</p><p>Transfer the checkout total, then tap <b>I Have Paid</b>. This reports your payment; the store must still confirm receipt.</p><button class="primary" type="button" id="bavReportPayment">I Have Paid</button><p id="bavPaymentMsg" class="msg" aria-live="polite">Place Order unlocks after you submit your payment report.</p>`;
  const submit = form.querySelector(
    'button[type="submit"],input[type="submit"]'
  );
  if (submit) {
    submit.id = "bavPlaceOrder";
    submit.disabled = true;
    submit.hidden = true;
  }
  const oldBank = form.querySelector(".bankBox");
  if (oldBank) oldBank.remove();
  const paymentLabel = $("coPayment")?.closest("label");
  if (paymentLabel) paymentLabel.insertAdjacentElement("afterend", panel);
  else form.prepend(panel);
  $("bavCopyAccount").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText("6714306196");
      $("bavPaymentMsg").textContent = "Account number copied.";
    } catch {
      $("bavPaymentMsg").textContent =
        "Copy not available. Please copy 6714306196 manually.";
    }
  });
  $("bavReportPayment").addEventListener("click", reportCheckoutPayment);
  $("coPayment")?.addEventListener("change", () => {
    const bank = $("coPayment").value === "bank_transfer";
    $("bavPaymentGate").classList.toggle("hidden", !bank);
    if (submit) {
      submit.hidden = !bank || !sessionStorage.getItem(checkoutReportKey());
      submit.disabled = !bank || !sessionStorage.getItem(checkoutReportKey());
    }
    if (!bank)
      $("bavPaymentMsg").textContent =
        "Only bank transfer is currently configured for this checkout.";
  });
  const key = checkoutReportKey();
  if (key && sessionStorage.getItem(key) && submit) {
    submit.hidden = false;
    submit.disabled = false;
    $("bavPaymentMsg").textContent =
      "Payment report saved for this checkout. You can place the order now.";
  }
}
async function reportCheckoutPayment() {
  const status = $("bavPaymentMsg");
  const key = checkoutReportKey();
  const submit = $("bavPlaceOrder");
  if (!user) {
    status.textContent = "Please sign in before reporting payment.";
    return;
  }
  if (!cart.length) {
    status.textContent = "Your cart is empty.";
    return;
  }
  if ($("coPayment").value !== "bank_transfer") {
    status.textContent = "Bank transfer is the only configured method.";
    return;
  }
  if (key && sessionStorage.getItem(key)) {
    if (submit) {
      submit.hidden = false;
      submit.disabled = false;
    }
    status.textContent =
      "Payment report already saved. You can place the order now.";
    return;
  }
  const amount = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const reportButton = $("bavReportPayment");
  reportButton.disabled = true;
  status.textContent = "Sending your payment report…";
  const { data: report, error } = await sb
    .from("payment_reports")
    .insert({
      user_id: user.id,
      order_id: null,
      amount,
      customer_note: "Customer tapped I Have Paid before placing the order.",
      status: "reported",
    })
    .select("id")
    .single();
  if (error) {
    reportButton.disabled = false;
    status.textContent = "Could not submit report: " + error.message;
    return;
  }
  sessionStorage.setItem(key, report.id);
  // Secure server-side RPC creates admin notifications without exposing admin notification permissions.
  const { error: notificationError } = await sb.rpc(
    "notify_admins_checkout_event",
    {
      p_title: "Customer reported payment",
      p_message: `${$("coName").value.trim()} (${ user.email || "no email" }) reports a transfer of ${money( amount )}. Check Moniepoint before confirming.`,
      p_type: "payment_reported",
      p_order_id: null,
    }
  );
  await sendOrderEmail("payment_reported", null);
  if (submit) {
    submit.hidden = false;
    submit.disabled = false;
  }
  status.textContent = notificationError
    ? "Payment report saved and Place Order unlocked, but admin alert needs permissions configured. " +
      notificationError.message
    : "Payment report sent. Place Order is now available. The store must still verify the transfer.";
  reportButton.disabled = false;
}
function prefillCheckout() {
  setupCheckoutPaymentGate();

  if (profile) {
    $("coName").value = profile.full_name || "";
    $("coPhone").value = profile.phone || "";
  }

  if ($("coAddress") && user) {
    const savedAddress =
      localStorage.getItem(`big_alien_address_${user.id}`) || "";

    if (!$("coAddress").value.trim() && savedAddress) {
      $("coAddress").value = savedAddress;
    }
  }
}
function renderAccountCustomerName() {
  const el = $("accountCustomerName");
  if (!el) return;
  const fullName = (
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    ""
  ).trim();
  const emailName = (user?.email || "").split("@")[0];
  el.textContent = fullName || emailName || "Welcome!";
}

async function loadProfile() {
  if (!user) return;
  const profileResult = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const data = profileResult.data || null;
  profile = data || { full_name: user.user_metadata?.full_name || user.user_metadata?.name || "", phone: user.user_metadata?.phone || "" };
  renderAccountCustomerName();
  prefillCheckout();
  $("profileName").value = data?.full_name || "";
  $("profilePhone").value = data?.phone || "";
  if ($("accountNameSummary")) $("accountNameSummary").textContent = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || "Add your name";
  if ($("accountPhoneSummary")) $("accountPhoneSummary").textContent = profile?.phone || user?.user_metadata?.phone || "Add your phone number";
  if ($("accountEmailSummary")) $("accountEmailSummary").textContent = user?.email || "Email unavailable";
  const addressKey = `big_alien_address_${user.id}`;
  const savedAddressText = localStorage.getItem(addressKey) || "";
  if ($("accountAddressSummary")) $("accountAddressSummary").textContent = savedAddressText || "Add your delivery address";
  if ($("savedAddress"))
    $("savedAddress").value = savedAddressText;
  if ($("coAddress") && !$("coAddress").value)
    $("coAddress").value = localStorage.getItem(addressKey) || "";
  const adminBtn = $("adminBtn");
  if (adminBtn) adminBtn.classList.toggle("hidden", data?.role !== "admin");
}
async function submitOrder(e) {
  e.preventDefault();
  if (!user) return msg("checkoutMsg", "Please sign in first.");
  if (!cart.length) return msg("checkoutMsg", "Cart is empty.");
  const reportKey = checkoutReportKey();
  const reportId = reportKey ? sessionStorage.getItem(reportKey) : null;
  if ($("coPayment").value !== "bank_transfer" || !reportId)
    return msg(
      "checkoutMsg",
      "Transfer payment and tap “I Have Paid” before placing your order."
    );
  
const subtotal = cart.reduce((a, x) => a + x.price * x.qty, 0);
const shippingFee = 3000;
const total = subtotal + shippingFee;
  
  const payload = {
    
user_id: user.id,
subtotal,
shipping_fee: shippingFee,
total,
payment_method: "bank_transfer",
    
    payment_status: "pending",
    order_status: "processing",
    customer_name: $("coName").value.trim(),
    customer_phone: $("coPhone").value.trim(),
    
delivery_address: [
  $("coCountry")?.value,
  $("coState")?.value,
  $("coLga")?.value,
  $("coCity")?.value,
  $("coStreet")?.value,
  $("coBuilding")?.value,
  $("coLandmark")?.value,
  $("coPostal")?.value
].filter(v => v && v.trim()).join(", "),

    notes: "Customer reported payment; awaiting admin verification.",
  };
  const { data: o, error } = await sb
    .from("orders")
    .insert(payload)
    .select()
    .single();
  if (error) return msg("checkoutMsg", error.message);
  const items = cart.map((x) => ({
    order_id: o.id,
    product_id: x.id,
    product_name: x.name,
    product_price: x.price,
    quantity: x.qty,
    image_url: x.image_url,
  }));
  const { error: ie } = await sb.from("order_items").insert(items);
  if (ie) {
    await sb.from("orders").delete().eq("id", o.id);
    return msg("checkoutMsg", ie.message);
  }
  const { error: linkError } = await sb
    .from("payment_reports")
    .update({ order_id: o.id })
    .eq("id", reportId)
    .eq("user_id", user.id)
    .eq("status", "reported");
  if (linkError)
    console.warn(
      "Order created but payment report could not be linked:",
      linkError.message
    );
  await sb.from("shipment_updates").insert({
    order_id: o.id,
    status: "Order received",
    message: "Order received; payment awaits admin verification.",
  });
  const { error: notifyError } = await sb.rpc("notify_admins_checkout_event", {
    p_title: "New order placed",
    p_message: `Order ${o.id.slice(0, 8)}: ${$("coName").value.trim()} · ${$( "coPhone" ).value.trim()} · ${money(total)}. Payment is awaiting verification.`,
    p_type: "new_order",
    p_order_id: o.id,
  });
  if (notifyError)
    console.warn("Admin new-order notification failed:", notifyError.message);
  await sendOrderEmail("new_order", o.id);
  sessionStorage.removeItem(reportKey);
  cart = [];
  saveCart();
  msg(
    "checkoutMsg",
    "Order placed. Your payment is awaiting store verification. Check My Orders for updates.",
    true
  );
  setTimeout(() => openOrders(), 600);
}
async function openOrders() {
  show("ordersView");
  await loadCustomerNotifications();
  let { data, error } = await sb
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error)
    return ($("ordersList").innerHTML = `<div class="summary">${esc( error.message )}</div>`);
  if (!data?.length)
    return ($(
      "ordersList"
    ).innerHTML = `<div class="summary">No orders yet.</div>`);
  let html = "";
  for (const o of data) {
    let { data: ups } = await sb
      .from("shipment_updates")
      .select("*")
      .eq("order_id", o.id)
      .order("created_at", { ascending: false });
    const latest = (ups || [])[0];
    const pickup =
      /arrived|ready for pickup|available for pickup|at pickup point/i.test(
        `${o.order_status || ""} ${latest?.status || ""} ${ latest?.message || "" }`
      );
    html += `<div class="orderCard"><b>Order ${o.id.slice( 0, 8 )}</b><p>Total: ${money(o.total)} · Payment: <span class="status">${esc( o.payment_status )}</span> · Status: <span class="status">${esc( o.order_status )}</span></p><p>Tracking: ${esc( o.tracking_number || "Not assigned" )}</p><p>Delivery: ${esc(o.delivery_address)}</p>${ pickup ? `<div class="pickupNotice"><b>📦 Your item may be ready for collection.</b><p>${esc( latest?.message || "Please check the latest shipment details before travelling to collect it." )}</p></div>` : "" }<h4>Shipment updates</h4>${ (ups || []) .map( (u) => `<div>📍 <b>${esc(u.status)}</b> — ${esc( u.message )} <span class="muted">${new Date( u.created_at ).toLocaleString()}</span></div>` ) .join("") || "<div class='muted'>No shipment updates yet.</div>" }</div>`;
  }
  $("ordersList").innerHTML = html;
  applyOrderFilter("ongoing");
} 
function applyOrderFilter(filter) {
  document.querySelectorAll("[data-order-filter]").forEach(b => b.classList.toggle("active", b.dataset.orderFilter === filter));
  document.querySelectorAll("#ordersList .orderCard").forEach(card => {
    const status = (card.querySelector(".status")?.textContent || "").toLowerCase();
    const cancelled = /cancel|return|refund/.test(card.textContent.toLowerCase());
    card.classList.toggle("hidden", filter === "cancelled" ? !cancelled : cancelled);
  });
}


async function loadCustomerNotifications() {
  const box = $("customerNotifications");
  if (!box || !sb || !user) return;

  const { data, error } = await sb
    .from("notifications")
    .select("id,title,message,type,order_id,read_at,created_at")
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    box.innerHTML = `<p class="notificationEmpty">Notifications are not available right now.</p>`;
    return;
  }

  const visible = (data || []).filter((n) =>
    n.type === "shipment_update" ||
    (n.type === "new_order" && n.title === "New order placed")
  );

  if (!visible.length) {
    box.innerHTML = `<p class="notificationEmpty">No notifications yet.</p>`;
    return;
  }

  box.innerHTML = visible.map((n) =>
    `<article class="notificationItem ${n.read_at ? "" : "unread"}">
      <span aria-hidden="true">${n.type === "shipment_update" ? "📦" : "🔔"}</span>
      <div class="notificationText">
        <b>${esc(n.title)}</b>
        <p>${esc(n.message)}</p>
        <small>${new Date(n.created_at).toLocaleString()}</small>
      </div>
      ${n.read_at ? "" : `<button class="secondary" type="button" data-read-notification="${n.id}">Mark read</button>`}
    </article>`
  ).join("");
}



async function loadCustomerInbox() {
  const box = $("customerInboxMessages");
  if (!box || !sb || !user) return;

  const { data, error } = await sb
    .from("notifications")
    .select("id,title,message,type,order_id,read_at,created_at")
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    box.innerHTML = `<p class="notificationEmpty">Inbox is not available right now.</p>`;
    return;
  }

  const visible = (data || []).filter((n) =>
    n.type === "shipment_update" ||
    (n.type === "new_order" && n.title === "New order placed")
  );

  if (!visible.length) {
    box.innerHTML = `<p class="notificationEmpty">Your inbox is empty.</p>`;
    return;
  }

  box.innerHTML = visible.map((n) =>
    `<article class="notificationItem ${n.read_at ? "" : "unread"}">
      <span aria-hidden="true">${n.type === "shipment_update" ? "📦" : "🔔"}</span>
      <div class="notificationText">
        <b>${esc(n.title)}</b>
        <p>${esc(n.message)}</p>
        <small>${new Date(n.created_at).toLocaleString()}</small>
      </div>
      ${n.read_at ? "" : `<button class="secondary" type="button" data-read-notification="${n.id}">Mark read</button>`}
    </article>`
  ).join("");
}



async function loadAdminNotifications() {
  const box = $("adminNotifications");
  if (!box || !sb || !user) return;

  const { data, error } = await sb
    .from("notifications")
    .select("id,title,message,type,order_id,read_at,created_at")
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    box.innerHTML = `<p class="notificationEmpty">Could not load notifications: ${esc(error.message)}</p>`;
    return;
  }

  const notifications = data || [];
  const unread = notifications.filter(n => !n.read_at).length;

  if ($("adminUnreadCount")) {
    $("adminUnreadCount").textContent = String(unread);
  }

  const clearAllButton = notifications.length
    ? `<button class="secondary" type="button" data-clear-all-admin-notifications>Clear All Notifications</button>`
    : "";

  if (!notifications.length) {
    box.innerHTML = `
      ${clearAllButton}
      <p class="notificationEmpty">No admin notifications yet.</p>
    `;
    return;
  }

  box.innerHTML = `
    <div class="adminNotificationActions">
      ${clearAllButton}
    </div>
    ${notifications.map(n => `
      <article class="notificationItem ${n.read_at ? "" : "unread"}">
        <span aria-hidden="true">${
          n.type === "new_order" ? "🛍️" :
          n.type === "payment_reported" ? "💳" : "🔔"
        }</span>
        <div class="notificationText">
          <b>${esc(n.title)}</b>
          <p>${esc(n.message)}</p>
          <small>${new Date(n.created_at).toLocaleString()}</small>
        </div>
        ${n.order_id ? `<button class="secondary" type="button" data-order="${n.order_id}">Open order</button>` : ""}
        ${!n.read_at ? `<button class="secondary" type="button" data-read-notification="${n.id}">Mark read</button>` : ""}
        <button class="secondary" type="button" data-clear-admin-notification="${n.id}">Clear</button>
      </article>
    `).join("")}
  `;

  box.querySelectorAll("[data-clear-admin-notification]").forEach(button => {
    button.onclick = () => clearAdminNotification(button.dataset.clearAdminNotification);
  });

  const clearAll = box.querySelector("[data-clear-all-admin-notifications]");
  if (clearAll) clearAll.onclick = clearAllAdminNotifications;
}

async function clearAdminNotification(id) {
  if (!confirm("Clear this notification only? The order and delivery history will remain.")) return;

  const { error } = await sb
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("recipient_user_id", user.id);

  if (error) {
    alert("Could not clear notification: " + error.message);
    return;
  }

  await loadAdminNotifications();
}

async function clearAllAdminNotifications() {
  if (!confirm("Clear all notifications for your admin account? Orders and delivery history will remain.")) return;

  const { error } = await sb
    .from("notifications")
    .delete()
    .eq("recipient_user_id", user.id);

  if (error) {
    alert("Could not clear notifications: " + error.message);
    return;
  }

  await loadAdminNotifications();
}


async function markNotificationRead(id) {
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_user_id", user.id);
  if (error) return alert(error.message);
  await loadCustomerNotifications();
  await loadCustomerInbox();
  await loadAdminNotifications();
}

async function sendOrderEmail(event, orderId) {
  // Email is sent by a server-side Supabase Edge Function; never put an email API key in browser code.
  try {
    const { error } = await sb.functions.invoke("notify-admin-order", {
      body: { event, order_id: orderId },
    });
    if (error)
      console.warn(
        "Email notification was not sent; check Edge Function setup:",
        error.message
      );
  } catch (err) {
    console.warn("Email notification is not configured yet:", err);
  }
}

async function openAdmin() {
  if (!user) return;
  let { data } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (data?.role !== "admin") {
    alert("This account is not an Admin account.");
    return;
  }
  show("adminView");
  loadAdminProducts();
  loadAdminOrders();
  loadAdminNotifications();
}
async function loadAdminProducts() {
  let { data, error } = await sb
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error)
    return ($("adminProducts").innerHTML = `<div class="summary">${esc( error.message )}</div>`);
  let rows = (data || [])
    .map(
      (p) =>
        `<div class="adminRow"><img src="${esc( imageOrFallback(p.image_url) )}"><div><b>${esc(p.name)}</b><div class="muted">${esc( p.category )}</div></div><div>${money(p.price)}</div><div>${p.stock}</div><div>${ p.active ? "Live" : "Hidden" }</div><div><button class="secondary" data-edit="${ p.id }">Edit</button> <button class="danger" data-delete="${ p.id }">Delete</button></div></div>`
    )
    .join("");
  $(
    "adminProducts"
  ).innerHTML = `<div class="adminTable"><div class="adminRow"><b>Image</b><b>Product</b><b>Price</b><b>Stock</b><b>Status</b><b>Actions</b></div>${rows}</div>`;
}
async function loadAdminOrders() {
  const box = $("adminOrders");

  const { data: orders, error } = await sb
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    box.innerHTML = `<div class="summary">Could not load orders: ${esc(error.message)}</div>`;
    return;
  }

  if (!orders || !orders.length) {
    box.innerHTML = `<div class="summary">No orders yet.</div>`;
    return;
  }

  const orderIds = orders.map((o) => o.id);

  const { data: items, error: itemsError } = await sb
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);

  const itemsByOrder = {};

  (items || []).forEach((item) => {
    if (!itemsByOrder[item.order_id]) {
      itemsByOrder[item.order_id] = [];
    }
    itemsByOrder[item.order_id].push(item);
  });

  box.innerHTML = orders.map((o) => {
    const orderItems = itemsByOrder[o.id] || [];

    const productsHtml = itemsError
      ? `<p class="summary">Could not load ordered products: ${esc(itemsError.message)}</p>`
      : orderItems.length
        ? `<h4>Ordered Products</h4>
           ${orderItems.map((item) => `
             <div class="adminOrderItem">
               <b>${esc(item.product_name || "Product")}</b>
               <p>Quantity: ${Number(item.quantity) || 0}</p>
               <p>Unit price: ${money(item.product_price)}</p>
               <p>Line total: ${money(
                 (Number(item.product_price) || 0) *
                 (Number(item.quantity) || 0)
               )}</p>
             </div>
           `).join("")}`
        : `<p class="muted">No product items were found for this order.</p>`;

    return `
      <div class="orderCard">
        <b>Order ${esc(String(o.id).slice(0, 8))}</b>
        <p>${esc(o.customer_name)} · ${esc(o.customer_phone)} · ${money(o.total)}</p>
        <p>Payment:
          <span class="status">${esc(o.payment_status)}</span>
          · Shipment:
          <span class="status">${esc(o.order_status)}</span>
        </p>
        <p><b>Delivery address:</b><br>
          ${esc(o.delivery_address || "No delivery address saved")}
        </p>
        ${productsHtml}
        <button class="primary" data-order="${esc(o.id)}">
          Manage Order
        </button>
      </div>
    `;
  }).join("");
}
function openProductModal(p = null) {
  $("productModalTitle").textContent = p ? "Edit Product" : "Add Product";
  $("productId").value = p?.id || "";
  $("productName").value = p?.name || "";
  $("productCategory").value = p?.category || "Solar";
  $("productPrice").value = p?.price || "";
  $("productStock").value = p?.stock ?? 0;
  $("productDescription").value = p?.description || "";
  $("imagePreview").innerHTML = p?.image_url
    ? `<img class="preview" src="${esc(p.image_url)}">`
    : "";
  $("productImage").value = "";
  $("productMsg").textContent = "";
  $("productModal").classList.remove("hidden");
}
async function saveProduct(e) {
  e.preventDefault();
  let id = $("productId").value;
  let imageUrl = null;
  let file = $("productImage").files[0];
  if (file) {
    let ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    let path = `${crypto.randomUUID()}.${ext}`;
    let { error: up } = await sb.storage
      .from("product-images")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (up) return msg("productMsg", up.message);
    let { data } = sb.storage.from("product-images").getPublicUrl(path);
    imageUrl = data.publicUrl;
  }
  let payload = {
    name: $("productName").value.trim(),
    category: $("productCategory").value,
    price: Number($("productPrice").value),
    stock: Number($("productStock").value),
    description: $("productDescription").value.trim(),
  };
  if (imageUrl) payload.image_url = imageUrl;
  let res = id
    ? await sb.from("products").update(payload).eq("id", id)
    : await sb.from("products").insert(payload);
  if (res.error) return msg("productMsg", res.error.message);
  $("productModal").classList.add("hidden");
  await loadProducts();
  await loadAdminProducts();
}
async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  let { error } = await sb.from("products").delete().eq("id", id);
  if (error) return alert(error.message);
  await loadProducts();
  loadAdminProducts();
}
async function manageOrder(id) {
  let { data: o } = await sb.from("orders").select("*").eq("id", id).single();
  let { data: ups } = await sb
    .from("shipment_updates")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false });
  $("orderModalBody").innerHTML = `<h2>Manage Order ${id.slice( 0, 8 )}</h2><p>${esc(o.customer_name)} · ${esc(o.customer_phone)}</p><p>${esc( o.delivery_address )}</p><label>Payment status<select id="mPay"><option ${ o.payment_status === "pending" ? "selected" : "" }>pending</option><option ${ o.payment_status === "paid" ? "selected" : "" }>paid</option><option ${ o.payment_status === "failed" ? "selected" : "" }>failed</option><option ${ o.payment_status === "refunded" ? "selected" : "" }>refunded</option></select></label><label>Shipment status<select id="mStatus">${[ "processing", "confirmed", "shipped", "out_for_delivery", "ready_for_collection", "delivered", "cancelled", ] .map( (s) => `<option ${o.order_status === s ? "selected" : ""}>${s}</option>` ) .join( "" )}</select></label><label>Tracking number<input id="mTrack" value="${esc( o.tracking_number || "" )}"></label><label>Shipment message<textarea id="mMessage" placeholder="e.g. Package has left Abuja sorting centre"></textarea></label><label>Location<input id="mLocation" placeholder="e.g. Abuja"></label><button class="primary" id="saveOrder">Save Update</button><h3>History</h3>${( ups || [] ) .map( (u) => `<div>📍 <b>${esc(u.status)}</b> — ${esc(u.message)} (${new Date( u.created_at ).toLocaleString()})</div>` ) .join("")}`;
  $("saveOrder").onclick = async () => {
    let pay = $("mPay").value,
      status = $("mStatus").value,
      track = $("mTrack").value.trim();
    let { error } = await sb
      .from("orders")
      .update({
        payment_status: pay,
        order_status: status,
        tracking_number: track || null,
      })
      .eq("id", id);
    if (error) return alert(error.message);
    const shipmentMessage =
      $("mMessage").value.trim() ||
      `Shipment status updated to ${status.replaceAll("_", " ")}.`;
    const { error: shipmentError } = await sb.from("shipment_updates").insert({
      order_id: id,
      status,
      message: shipmentMessage,
      location: $("mLocation").value.trim() || null,
    });
    if (shipmentError)
      return alert(
        `Order saved, but shipment notification could not be created: ${shipmentError.message}`
      );
    await sendOrderEmail("shipment_update", id);
    $("orderModal").classList.add("hidden");
    await loadAdminOrders();
    await loadAdminNotifications();
  };
  $("orderModal").classList.remove("hidden");
}
async function init() {
  if (!ready) {
    show("authView");
    msg(
      "authMsg",
      "The site is not connected to Supabase yet.\nAdd the URL and publishable key in config.js."
    );
    return;
  }
  sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
  let { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  if (user) {
    await loadProfile();
    show("homeView");
    await loadProducts();
  } else show("authView");
  sb.channel("bav-order-notifications")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications" },
      (payload) => {
        const n = payload.new;
        if (n?.recipient_user_id === user?.id) {
          loadCustomerNotifications();
          loadCustomerInbox();
          loadAdminNotifications();
          if ("Notification" in window && Notification.permission === "granted")
            new Notification(n.title || "Big Alien Venture", {
              body: n.message || "Your order has an update.",
            });
        }
      }
    )
    .subscribe();
  sb.auth.onAuthStateChange(async (event, s) => {
    user = s?.user || null;
    if (!user) {
      show("authView");
      return;
    }
    // Supabase emits USER_UPDATED when an email/password/profile changes.
    // Do not throw the customer back to the marketplace during account work.
    if (event === "USER_UPDATED" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      await loadProfile();
      return;
    }
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
      await loadProfile();
      show("homeView");
      await loadProducts();
    }
  });
}
// Immediate, explicit handlers for mobile navigation and account menu.
function bindAccountAndBottomNavigation() {
  const nav = $("bottomNav");
  if (nav) {
    nav.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.id;
        if (button.dataset.view === "home") {
          show("homeView");
          renderProducts();
        } else if (id === "bottomCategoriesBtn") {
          show("homeView");
          const cats = $("categories");
          if (cats) cats.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (id === "bottomCartBtn") {
          show("cartView");
          renderCart();
        } else if (id === "bottomWishlistBtn") {
          show("wishlistView");
          renderWishlist();
        } else if (id === "bottomProfileBtn") {
          show("profileView");
          loadProfile();
        }
      });
    });
  }
  document.querySelectorAll("[data-account-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.accountAction;
      if (action === "orders") {
        show("ordersView");
        openOrders();
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      if (action === "inbox") {
        show("customerInboxView");
        loadCustomerInbox();
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      const viewId =
        action === "personal" ? "personalDetailsView"
          : action === "address" ? "deliveryAddressView"
          : action === "email" ? "emailSettingsView"
          : action === "password" ? "passwordSettingsView"
          : action === "management" ? "accountManagementView"
          : action === "reviews"
          ? "reviewsView"
          : action === "support"
          ? "supportView"
          : null;
      if (viewId) {
        show(viewId);
        window.scrollTo({ top: 0, behavior: "auto" });
      }
      if (action === "management") loadProfile();
    });
  });
}

const pageBackBtn = $("pageBackBtn");
if (pageBackBtn) {
  pageBackBtn.addEventListener("click", () => {
    const previousView = viewHistory.pop();
    const targetView =
      previousView ||
      (user ? "homeView" : "authView");
    show(targetView, false);
    window.scrollTo({ top: 0, behavior: "auto" });

    if (targetView === "homeView") renderProducts();
    if (targetView === "cartView") renderCart();
    if (targetView === "wishlistView") renderWishlist();
    if (targetView === "ordersView") openOrders();
    if (targetView === "profileView") loadProfile();
  });
}

document.querySelectorAll("[data-account-back]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    show("profileView");
    window.scrollTo({ top: 0, behavior: "auto" });
  });
});

document.addEventListener("click", async (e) => {
  // Use the containing control when a user taps its icon or text on mobile.
  let t = e.target.closest("button, a") || e.target;
  if (t.dataset.readNotification) {
    e.preventDefault();
    await markNotificationRead(t.dataset.readNotification);
    return;
  }
  if (t.dataset.view === "home") {
    e.preventDefault();
    show("homeView");
    renderProducts();
  }
  if (t.dataset.cat) {
    category = t.dataset.cat;
    renderCats();
    renderProducts();
  }
  if (t.dataset.product) openProduct(t.dataset.product);
  if (t.dataset.wishlistRemove) {
    toggleWishlist(t.dataset.wishlistRemove);
  }
  if (t.dataset.wishlistAdd) {
    toggleWishlist(t.dataset.wishlistAdd);
  }
  if (t.id === "cartBtn" || t.id === "bottomCartBtn") {
    show("cartView");
    renderCart();
  }
  if (t.id === "bottomCategoriesBtn") {
    show("homeView");
    const cats = $("categories");
    if (cats) cats.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (t.id === "bottomWishlistBtn") {
    show("wishlistView");
    renderWishlist();
  }
  if (t.id === "bottomOrdersBtn") {
    show("ordersView");
    openOrders();
  }
  if (t.dataset.accountAction) {
    ["accountManagementPanel", "reviewsPanel", "supportPanel"].forEach((id) =>
      $(id)?.classList.add("hidden")
    );
    if (t.dataset.accountAction === "orders") {
      show("ordersView");
      openOrders();
    }
    if (t.dataset.accountAction === "inbox") {
      show("customerInboxView");
      loadCustomerInbox();
    }
    if (t.dataset.accountAction === "personal") show("personalDetailsView");
    if (t.dataset.accountAction === "address") show("deliveryAddressView");
    if (t.dataset.accountAction === "email") show("emailSettingsView");
    if (t.dataset.accountAction === "password") show("passwordSettingsView");
    if (t.dataset.accountAction === "management")
      $("accountManagementPanel").classList.remove("hidden");
    if (t.dataset.accountAction === "reviews")
      $("reviewsPanel").classList.remove("hidden");
    if (t.dataset.accountAction === "support")
      $("supportPanel").classList.remove("hidden");
  }
  if (t.id === "bottomProfileBtn") {
    show("profileView");
    loadProfile();
  }
  if (t.id === "accountBtn") {
    show("profileView");
    loadProfile();
  }
  if (t.id === "adminBtn") {
    openAdmin();
  }
  if (t.id === "checkoutBtn") {
    show("checkoutView");
    prefillCheckout();
  }
  if (t.dataset.minus) {
    let x = cart.find((x) => String(x.id) === String(t.dataset.minus));
    if (x) {
      x.qty = Math.max(1, x.qty - 1);
      saveCart();
      renderCart();
    }
  }
  if (t.dataset.plus) {
    const item = cart.find((row) => String(row.id) === String(t.dataset.plus));
    const product = productById(t.dataset.plus);
    if (item) {
      const stock = product ? productStock(product, item.stock) : productStock(item, 0);
      const currentQty = Math.max(1, Number(item.qty) || 1);
      if (stock < 1) {
        alert("Stock information is unavailable for this product. Please refresh the marketplace or contact the store owner.");
      } else if (currentQty >= stock) {
        alert(`You have reached the available stock (${stock}) for this product. The store owner must update the product stock if more units are available.`);
      } else {
        item.qty = currentQty + 1;
        item.stock = stock;
        saveCart();
        renderCart();
      }
    }
  }
  if (t.dataset.remove) {
    cart = cart.filter((x) => String(x.id) !== String(t.dataset.remove));
    saveCart();
    renderCart();
  }
  if (t.dataset.edit) {
    let { data } = await sb
      .from("products")
      .select("*")
      .eq("id", t.dataset.edit)
      .single();
    openProductModal(data);
  }
  if (t.dataset.delete) deleteProduct(t.dataset.delete);
  if (t.dataset.order) manageOrder(t.dataset.order);
  if (t.dataset.readNotification)
    markNotificationRead(t.dataset.readNotification);
  if (t.dataset.close) $(t.dataset.close).classList.add("hidden");
  if (t.dataset.auth) {
    document
      .querySelectorAll("[data-auth]")
      .forEach((x) =>
        x.classList.toggle("active", x.dataset.auth === t.dataset.auth)
      );
    $("loginForm").classList.toggle("hidden", t.dataset.auth !== "login");
    $("signupForm").classList.toggle("hidden", t.dataset.auth !== "signup");
  }
  if (t.dataset.orderFilter) applyOrderFilter(t.dataset.orderFilter);
  if (t.dataset.adminTab) {
    $("adminProductsTab").classList.toggle(
      "hidden",
      t.dataset.adminTab !== "products"
    );
    $("adminOrdersTab").classList.toggle(
      "hidden",
      t.dataset.adminTab !== "orders"
    );
    document
      .querySelectorAll("[data-admin-tab]")
      .forEach((x) =>
        x.classList.toggle("active", x.dataset.adminTab === t.dataset.adminTab)
      );
  }
});
$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  let { error } = await sb.auth.signInWithPassword({
    email: $("loginEmail").value,
    password: $("loginPassword").value,
  });
  if (error) msg("authMsg", error.message);
};
async function signInWithGoogle() {
  if (!sb) {
    msg("authMsg", "Google sign-in is unavailable until Supabase is configured.");
    return;
  }
  const button = $("googleAuthBtn");
  if (button) { button.disabled = true; button.textContent = "Connecting to Google…"; }
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    msg("authMsg", error.message);
    if (button) { button.disabled = false; button.innerHTML = '<span class="googleG" aria-hidden="true">G</span> Continue with Google'; }
  }
}
if ($("googleAuthBtn")) $("googleAuthBtn").addEventListener("click", signInWithGoogle);
let pendingOtpEmail = "",
  otpTimer = null;
function startOtpTimer(seconds = 60) {
  clearInterval(otpTimer);
  let left = seconds,
    btn = $("resendOtpBtn");
  btn.disabled = true;
  btn.textContent = `Resend OTP in ${left}s`;
  otpTimer = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(otpTimer);
      btn.disabled = false;
      btn.textContent = "Resend OTP";
    } else btn.textContent = `Resend OTP in ${left}s`;
  }, 1000);
}
async function openOtp(email) {
  pendingOtpEmail = email;
  $("otpEmail").textContent = email;
  $("otpCode").value = "";
  $("otpMsg").textContent = "";
  show("otpView");
  startOtpTimer(60);
  setTimeout(() => $("otpCode").focus(), 100);
}
$("signupForm").onsubmit = async (e) => {
  e.preventDefault();
  let email = $("signupEmail").value.trim().toLowerCase(),
    password = $("signupPassword").value;
  let { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: $("signupName").value, phone: $("signupPhone").value },
    },
  });
  if (error) return msg("authMsg", error.message);
  if (data.session) {
    await loadProfile();
    show("homeView");
    await loadProducts();
    return;
  }
  await openOtp(email);
};
$("otpForm").onsubmit = async (e) => {
  e.preventDefault();
  let token = $("otpCode").value.trim();
  if (!/^\d{6}$/.test(token))
    return msg("otpMsg", "Enter the 6-digit verification code.");
  let { data, error } = await sb.auth.verifyOtp({
    email: pendingOtpEmail,
    token,
    type: "signup",
  });
  if (error) return msg("otpMsg", error.message);
  msg("otpMsg", "Email verified successfully.", true);
  user = data.user || data.session?.user || user;
  await loadProfile();
  show("homeView");
  await loadProducts();
};
$("resendOtpBtn").onclick = async () => {
  if (!pendingOtpEmail) return;
  let { error } = await sb.auth.resend({
    type: "signup",
    email: pendingOtpEmail,
  });
  if (error) return msg("otpMsg", error.message);
  msg("otpMsg", "A new verification code has been sent.", true);
  startOtpTimer(60);
};
$("otpBackBtn").onclick = () => {
  show("authView");
  document
    .querySelectorAll("[data-auth]")
    .forEach((x) => x.classList.toggle("active", x.dataset.auth === "signup"));
  $("loginForm").classList.add("hidden");
  $("signupForm").classList.remove("hidden");
};
$("searchBtn").onclick = () => {
  query = $("search").value;
  show("homeView");
  renderProducts();
};
$("search").oninput = () => {
  query = $("search").value;
  renderProducts();
};
$("checkoutForm").onsubmit = submitOrder;
$("profileForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!user || !sb) return msg("profileMsg", "Please sign in again.");
  const payload = { full_name: $("profileName").value.trim(), phone: $("profilePhone").value.trim() };
  const { error } = await sb.from("profiles").upsert({ id: user.id, ...payload }, { onConflict: "id" });
  if (error) return msg("profileMsg", error.message);
  profile = { ...(profile || {}), ...payload };
  msg("profileMsg", "Personal details saved.", true);
  await loadProfile();
};

if ($("adminNotificationsBtn"))
  $("adminNotificationsBtn").onclick = async () => {
    const panel = $("adminNotificationsPanel");
    panel.classList.toggle("hidden");
    await loadAdminNotifications();
  };
if ($("refreshAdminNotifications"))
  $("refreshAdminNotifications").onclick = loadAdminNotifications;
if ($("refreshCustomerNotifications"))
  $("refreshCustomerNotifications").onclick = loadCustomerNotifications;
if ($("logoutBtn")) $("logoutBtn").onclick = () => sb.auth.signOut();
if ($("logoutMenuBtn")) $("logoutMenuBtn").onclick = () => sb.auth.signOut();
function applyTheme(dark) {
  document.body.classList.toggle("dark", !!dark);
  localStorage.setItem("big_alien_dark_mode", dark ? "1" : "0");
  if ($("darkModeToggle")) $("darkModeToggle").checked = !!dark;
}
applyTheme(localStorage.getItem("big_alien_dark_mode") === "1");

// Move each existing working account form onto its own screen without cloning IDs.
function arrangeAccountSettingsScreens() {
  const profileForm = $("profileForm");
  const addressFieldset = profileForm?.querySelector(".addressFieldset");
  if (profileForm && addressFieldset) {
    const nameLabel = profileForm.querySelector('label:has(#profileName)');
    const phoneLabel = profileForm.querySelector('label:has(#profilePhone)');
    const saveButton = profileForm.querySelector('button[type="submit"]');
    const status = $("profileMsg");
    const personalSlot = $("personalFormSlot");
    const addressSlot = $("addressFormSlot");
    if (personalSlot && nameLabel && phoneLabel) {
      const personalForm = document.createElement("form");
      personalForm.id = "personalDetailsForm";
      personalForm.append(nameLabel, phoneLabel);
      const personalSave = document.createElement("button"); personalSave.type = "submit"; personalSave.className = "primary"; personalSave.textContent = "Save Personal Details";
      const personalMsg = document.createElement("div"); personalMsg.id = "personalDetailsMsg"; personalMsg.className = "msg"; personalMsg.setAttribute("aria-live", "polite");
      personalForm.append(personalSave, personalMsg); personalSlot.append(personalForm);
      personalForm.addEventListener("submit", async (e) => { e.preventDefault(); if (!user || !sb) return msg("personalDetailsMsg", "Please sign in again."); const payload={full_name:$("profileName").value.trim(),phone:$("profilePhone").value.trim()}; const {error}=await sb.from("profiles").upsert({id:user.id,...payload},{onConflict:"id"}); if(error)return msg("personalDetailsMsg",error.message); profile={...(profile||{}),...payload}; msg("personalDetailsMsg","Personal details saved.",true); await loadProfile(); });
    }
    if (addressSlot) {
      const addressForm = document.createElement("form"); addressForm.id = "deliveryAddressForm";
      addressForm.append(addressFieldset);
      const save = document.createElement("button"); save.type="submit"; save.className="primary"; save.textContent="Save Delivery Address";
      const statusEl = document.createElement("div"); statusEl.id="deliveryAddressMsg"; statusEl.className="msg"; statusEl.setAttribute("aria-live","polite");
      addressForm.append(save,statusEl); addressSlot.append(addressForm);
      addressForm.addEventListener("submit", async (e)=>{e.preventDefault(); if(!user)return msg("deliveryAddressMsg","Please sign in again."); const vals=["profileCountry","profileState","profileLga","profileCity","profileStreet","profileBuilding","profileLandmark","profilePostal"].map(id=>$(id)?.value.trim()||""); if(vals.slice(0,6).some(v=>!v))return msg("deliveryAddressMsg","Please complete the required address fields."); const address= [vals[3], vals[4], vals[5], vals[6], vals[2], vals[1], vals[0], vals[7]].filter(Boolean).join(", "); localStorage.setItem(`big_alien_address_${user.id}`,address); if($("savedAddress"))$("savedAddress").value=address; if($("coAddress"))$("coAddress").value=address; if($("accountAddressSummary"))$("accountAddressSummary").textContent=address; msg("deliveryAddressMsg","Delivery address saved.",true); });
    }
    // The legacy account-management page remains available, but the new menu routes to focused screens.
    if (saveButton) saveButton.remove(); if (status) status.remove();
  }
  const emailForm=$("changeEmailForm"); if(emailForm && $("emailFormSlot")) $("emailFormSlot").append(emailForm);
  const passwordForm=$("changePasswordForm"); if(passwordForm && $("passwordFormSlot")) $("passwordFormSlot").append(passwordForm);
}
arrangeAccountSettingsScreens();

if ($("darkModeToggle"))
  $("darkModeToggle").addEventListener("change", (e) =>
    applyTheme(e.target.checked)
  );
const reviewPhotoInput = $("reviewPhotos");
let selectedReviewPhotos = [];
if (reviewPhotoInput)
  reviewPhotoInput.addEventListener("change", () => {
    const files = Array.from(reviewPhotoInput.files || []);
    const preview = $("reviewPhotoPreview");
    if (files.length > 4) {
      alert("Please choose no more than 4 photos.");
      reviewPhotoInput.value = "";
      selectedReviewPhotos = [];
      if (preview) preview.replaceChildren();
      return;
    }
    const tooLarge = files.find((file) => file.size > 5 * 1024 * 1024);
    if (tooLarge) {
      alert("Each photo must be 5 MB or smaller.");
      reviewPhotoInput.value = "";
      selectedReviewPhotos = [];
      if (preview) preview.replaceChildren();
      return;
    }
    selectedReviewPhotos = files.filter((file) =>
      file.type.startsWith("image/")
    );
    if (preview) {
      preview.replaceChildren();
      selectedReviewPhotos.forEach((file) => {
        const figure = document.createElement("figure");
        const img = document.createElement("img");
        img.alt = file.name;
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);
        const caption = document.createElement("figcaption");
        caption.textContent = file.name;
        figure.append(img, caption);
        preview.append(figure);
      });
    }
  });
if ($("sendReviewBtn"))
  $("sendReviewBtn").onclick = () => {
    const rating = $("reviewRating").value;
    const review = $("reviewText").value.trim();
    if (!review) {
      alert("Please write a short review first.");
      return;
    }
    const photoNote = selectedReviewPhotos.length
      ? `\nPhotos selected: ${selectedReviewPhotos.length}. I will attach these photos in WhatsApp before sending.`
      : "";
    const text = `Big Alien Venture customer review\nRating: ${rating}/5\nCustomer: ${ user?.email || "Customer" }\nReview: ${review}${photoNote}`;
    window.open(
      `https://wa.me/2347025136166?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener"
    );
  };
$("productForm").onsubmit = saveProduct;
$("addProductBtn").onclick = () => openProductModal();
$("adminLogout").onclick = () => show("homeView");
document.querySelector(".brand").addEventListener("click", (e) => {
  e.preventDefault();
  show("homeView");
});
saveCart();
bindAccountAndBottomNavigation();
init();

// Refresh the admin notification badge while the admin dashboard is open.
setInterval(() => {
  const adminView = $("adminView");
  if (user && adminView && !adminView.classList.contains("hidden")) {
    loadAdminNotifications();
  }
}, 30000);
const goToCheckoutBtn = $("goToCheckoutBtn");
if (goToCheckoutBtn) {
  goToCheckoutBtn.onclick = () => show("checkoutView");
}


const changeEmailForm = $("changeEmailForm");
const emailOtpSection = $("emailOtpSection");
const currentEmailOtpInput = $("emailChangeOldOtp");
const newEmailOtpInput = $("emailChangeNewOtp");
const currentEmailForOtp = $("currentEmailForOtp");
const newEmailForOtp = $("newEmailForOtp");
const verifyEmailOtpBtn = $("verifyEmailOtpBtn");
const resendEmailOtpBtn = $("resendEmailOtpBtn");
const emailOtpCountdown = $("emailOtpCountdown");

let pendingEmailChange = "";
let pendingCurrentEmail = "";
let emailOtpTimer = null;
let emailOtpSeconds = 0;

function startEmailOtpCountdown() {
  if (!resendEmailOtpBtn || !emailOtpCountdown) return;
  clearInterval(emailOtpTimer);
  emailOtpSeconds = 60;
  resendEmailOtpBtn.disabled = true;

  const updateCountdown = () => {
    emailOtpCountdown.textContent = emailOtpSeconds > 0
      ? `Resend codes in ${emailOtpSeconds}s`
      : "You can resend the code now.";
    if (emailOtpSeconds <= 0) {
      clearInterval(emailOtpTimer);
      resendEmailOtpBtn.disabled = false;
      return;
    }
    emailOtpSeconds--;
  };
  updateCountdown();
  emailOtpTimer = setInterval(updateCountdown, 1000);
}

if (changeEmailForm) {
  changeEmailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("emailChangeMsg");
    const setStatus = (text, ok = false) => {
      if (status) {
        status.textContent = text;
        status.style.color = ok ? "#147a32" : "#b00020";
      }
    };

    if (!sb) {
      setStatus("The account service is not connected. Please refresh and try again.");
      return;
    }
    const newEmail = $("newAccountEmail")?.value.trim().toLowerCase() || "";
    if (!newEmail) {
      setStatus("Please enter your new email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setStatus("Please enter a valid email address.");
      return;
    }

    setStatus("Checking your account…");
    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) {
      setStatus("Please sign in again before changing your email.");
      return;
    }
    pendingCurrentEmail = (userData.user.email || "").trim().toLowerCase();
    if (!pendingCurrentEmail) {
      setStatus("Could not read your current email. Please sign in again.");
      return;
    }
    if (newEmail === pendingCurrentEmail) {
      setStatus("That is already your current email address.");
      return;
    }

    const submitButton = changeEmailForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setStatus("Requesting email verification codes…");
    try {
      const { error } = await sb.auth.updateUser({ email: newEmail });
      if (error) {
        setStatus("Email update failed: " + error.message);
        return;
      }

      pendingEmailChange = newEmail;
      if (currentEmailForOtp) currentEmailForOtp.textContent = pendingCurrentEmail;
      if (newEmailForOtp) newEmailForOtp.textContent = pendingEmailChange;
      if (currentEmailOtpInput) currentEmailOtpInput.value = "";
      if (newEmailOtpInput) newEmailOtpInput.value = "";
      if (emailOtpSection) emailOtpSection.hidden = false;
      setStatus("Check both email inboxes for the 6-digit verification codes.", true);
      startEmailOtpCountdown();
    } catch (error) {
      setStatus("Email update failed: " + (error?.message || String(error)));
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

if (verifyEmailOtpBtn) {
  verifyEmailOtpBtn.addEventListener("click", async () => {
    const status = $("emailChangeMsg");
    const setStatus = (text, ok = false) => {
      if (status) {
        status.textContent = text;
        status.style.color = ok ? "#147a32" : "#b00020";
      }
    };
    const oldToken = currentEmailOtpInput?.value.trim() || "";
    const newToken = newEmailOtpInput?.value.trim() || "";

    if (!sb) return setStatus("The account service is not connected. Refresh and try again.");
    if (!pendingCurrentEmail || !pendingEmailChange) {
      setStatus("Please request an email change first.");
      return;
    }
    if (!/^\d{6}$/.test(oldToken) || !/^\d{6}$/.test(newToken)) {
      setStatus("Enter both 6-digit verification codes.");
      return;
    }

    verifyEmailOtpBtn.disabled = true;
    setStatus("Verifying the code sent to your current email…");
    try {
      const { error: oldError } = await sb.auth.verifyOtp({
        email: pendingCurrentEmail, token: oldToken, type: "email_change"
      });
      if (oldError) {
        setStatus("Current email code failed: " + oldError.message);
        return;
      }

      setStatus("Current email verified. Verifying the new email…");
      const { error: newError } = await sb.auth.verifyOtp({
        email: pendingEmailChange, token: newToken, type: "email_change"
      });
      if (newError) {
        setStatus("New email code failed: " + newError.message + ". If the first code was accepted, request a fresh code and try again.");
        return;
      }

      const { data, error } = await sb.auth.getUser();
      if (error || data?.user?.email?.toLowerCase() !== pendingEmailChange.toLowerCase()) {
        setStatus("Verification was submitted, but the account email is not confirmed as changed yet. Refresh and check the account email.");
        return;
      }

      setStatus("Email address updated successfully.", true);
      if (emailOtpSection) emailOtpSection.hidden = true;
      pendingEmailChange = "";
      pendingCurrentEmail = "";
      if (currentEmailOtpInput) currentEmailOtpInput.value = "";
      if (newEmailOtpInput) newEmailOtpInput.value = "";
      if (emailOtpCountdown) emailOtpCountdown.textContent = "";
      if (resendEmailOtpBtn) resendEmailOtpBtn.disabled = false;
      clearInterval(emailOtpTimer);
      changeEmailForm?.reset();
      await loadProfile();
    } catch (error) {
      setStatus("Verification failed: " + (error?.message || String(error)));
    } finally {
      verifyEmailOtpBtn.disabled = false;
    }
  });
}

if (resendEmailOtpBtn) {
  resendEmailOtpBtn.addEventListener("click", async () => {
    const status = $("emailChangeMsg");
    const setStatus = (text, ok = false) => {
      if (status) {
        status.textContent = text;
        status.style.color = ok ? "#147a32" : "#b00020";
      }
    };
    if (!sb || !pendingEmailChange) {
      setStatus("Request an email change first.");
      return;
    }
    resendEmailOtpBtn.disabled = true;
    setStatus("Requesting a fresh verification code for the new email…");
    try {
      const { error } = await sb.auth.resend({ type: "email_change", email: pendingEmailChange });
      if (error) {
        setStatus("Could not resend code: " + error.message);
        resendEmailOtpBtn.disabled = false;
        return;
      }
      if (newEmailOtpInput) newEmailOtpInput.value = "";
      setStatus("A fresh code was requested. Check the email inboxes and enter the valid codes.", true);
      startEmailOtpCountdown();
    } catch (error) {
      setStatus("Could not resend code: " + (error?.message || String(error)));
      resendEmailOtpBtn.disabled = false;
    }
  });
}


const changePasswordForm = $("changePasswordForm");

if (changePasswordForm) {
  changePasswordForm.onsubmit = async (e) => {
    e.preventDefault();

    const msg = $("passwordChangeMsg");
    const password = $("newAccountPassword").value;
    const confirmPassword = $("confirmAccountPassword").value;

    if (password.length < 6) {
      msg.textContent = "Password must be at least 6 characters.";
      return;
    }

    if (password !== confirmPassword) {
      msg.textContent = "The passwords do not match.";
      return;
    }

    msg.textContent = "Updating password...";

    try {
      const { error } = await sb.auth.updateUser({
        password: password
      });

      msg.textContent = error
        ? "Password update failed: " + error.message
        : "Password updated successfully.";

      if (!error) changePasswordForm.reset();
    } catch (error) {
      msg.textContent = "Password update failed: " + error.message;
    }
  };
}
