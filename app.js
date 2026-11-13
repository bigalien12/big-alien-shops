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
  query = "",
  selectedDepartment = "all";
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
let productReturnView = "homeView";
const departmentCategory = { chicken: "All", solar: "All" };
const viewHistory = [];
let customerOrdersCache = [];
let customerOrderItemsCache = {};
let checkoutRewardBalance = 0;
let checkoutRewardLoading = false;

function show(id, remember = true) {
  // A deliberate return to the marketplace starts a fresh customer navigation path.
  if (id === "homeView" && remember) viewHistory.length = 0;
  if (remember && currentView && currentView !== id) {
    viewHistory.push(currentView);
    // Keep history bounded during long shopping sessions.
    if (viewHistory.length > 50) viewHistory.shift();
  }
  currentView = id;

  // Remember the last customer screen in this browser tab so returning from
  // another app (or a tab reload) restores the same section.
  try {
    if (!["authView", "otpView"].includes(id)) {
      sessionStorage.setItem("bav_last_view", id);
      sessionStorage.setItem("bav_last_scroll", String(window.scrollY || 0));
    } else {
      sessionStorage.removeItem("bav_last_view");
      sessionStorage.removeItem("bav_last_scroll");
    }
  } catch (_) {}

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
      "rewardsView",
      "supportView",
      "deleteAccountView",
    ].includes(id)
  );
  [
    "authView",
    "otpView",
    "homeView",
    "chickenShopView",
    "solarShopView",
    "discoveryView",
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
    "rewardsView",
    "supportView",
    "deleteAccountView",
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
            "rewardsView",
            "supportView",
            "deleteAccountView",
          ].includes(id) &&
            button.id === "bottomProfileBtn") ||
          (id === "cartView" && button.id === "bottomCartBtn") ||
          (id === "wishlistView" && button.id === "bottomWishlistBtn")
      );
    });
  }
  if (id === "checkoutView") loadCheckoutRewards();
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
function wishlistToast(message, ok = true) {
  let toast = $("wishlistToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "wishlistToast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    Object.assign(toast.style, {
      position: "fixed", left: "16px", right: "16px", bottom: "88px", zIndex: "9999",
      padding: "13px 16px", borderRadius: "12px", color: "#fff", fontWeight: "700",
      textAlign: "center", boxShadow: "0 5px 20px #0003"
    });
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.background = ok ? "#147a32" : "#b42318";
  toast.style.display = "block";
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.display = "none"; }, 2400);
}
function renderWishlist() {
  const saved = getWishlist();
  const items = products.filter((p) => saved.includes(String(p.id)));
  const empty = $("wishlistEmpty");
  const list = $("wishlistItems");
  if (empty) {
    empty.classList.toggle("hidden", items.length > 0);
    empty.innerHTML = items.length ? "" : `<div style="text-align:center;padding:18px"><div style="font-size:42px;margin-bottom:8px">♡</div><h3>Your wishlist is waiting</h3><p class="muted">Save products you love and they’ll be ready when you are.</p><button class="primary" type="button" data-wishlist-shop>Explore products</button></div>`;
  }
  if (list) {
    list.innerHTML = items.map((p) => {
      const inStock = productStock(p) > 0;
      return `<article class="card wishlistCard"><img src="${esc(imageOrFallback(p.image_url))}" alt="${esc(p.name)}"><div class="cardBody"><h3>${esc(p.name)}</h3><div class="price">${money(p.price)}</div><div class="stockBadge ${inStock ? "inStock" : "outStock"}">${inStock ? "● In Stock" : "Out of Stock"}</div><button class="primary" type="button" data-wishlist-cart="${esc(p.id)}" ${inStock ? "" : "disabled"}>🛒 Add to Cart</button><button class="secondary" type="button" data-product="${esc(p.id)}">View Product</button><button class="secondary" type="button" data-wishlist-remove="${esc(p.id)}">♡ Remove from Wishlist</button></div></article>`;
    }).join("");
  }
}
function toggleWishlist(id) {
  const key = `big_alien_wishlist_${user?.id || "guest"}`;
  const list = getWishlist();
  id = String(id);
  const isSaved = list.includes(id);
  const next = isSaved ? list.filter((x) => x !== id) : [...list, id];
  localStorage.setItem(key, JSON.stringify(next));
  renderWishlist();
  renderProducts();
  const product = productById(id);
  wishlistToast(isSaved ? `${product?.name || "Product"} removed from your wishlist.` : `${product?.name || "Product"} saved to your wishlist.`);
  return !isSaved;
}
function imageOrFallback(url) {
  return url || "images/logo.png";
}
function renderCats() {
  let departmentProducts = selectedDepartment === "all" ? products : products.filter(p => (p.department || "general") === selectedDepartment);
  let cats = ["All", ...new Set(departmentProducts.map((p) => p.category))];
  $("categories").innerHTML = cats
    .map(
      (c) =>
        `<button class="${c === category ? "active" : ""}" data-cat="${esc( c )}">${esc(c)}</button>`
    )
    .join("");
}
// Browsing history is stored only on this device, separately for each signed-in customer.
function browsingHistoryKey() {
  return user?.id ? `bav_recent_products_${user.id}` : null;
}
function getRecentProductIds() {
  const key = browsingHistoryKey();
  if (!key) return [];
  try {
    const ids = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(ids) ? ids.filter(id => typeof id === "string").slice(0, 12) : [];
  } catch (_) { return []; }
}
function rememberViewedProduct(id) {
  const key = browsingHistoryKey();
  if (!key) return;
  const value = String(id);
  const ids = [value, ...getRecentProductIds().filter(x => x !== value)].slice(0, 12);
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch (_) {}
}
function discoveryProductCard(p) {
  const inStock = productStock(p) > 0;
  return `<article class="card"><div class="discoveryImageWrap"><button type="button" data-product="${esc(p.id)}" aria-label="View ${esc(p.name)}" style="display:block;width:100%;padding:0;border:0;background:transparent;cursor:pointer;line-height:0"><img src="${esc(imageOrFallback(p.image_url))}" alt="${esc(p.name)}" loading="lazy" decoding="async"></button><button type="button" class="discoveryQuickAdd" data-discovery-add="${esc(p.id)}" aria-label="Add ${esc(p.name)} to cart" ${inStock ? "" : "disabled"}>+</button></div><div class="cardBody"><div class="muted">${esc(p.category || "Product")}</div><h3>${esc(p.name)}</h3><div class="price">${money(p.price)}</div></div></article>`;
}
function getRecommendedProducts() {
  const recent = getRecentProductIds().map(productById).filter(Boolean);
  const viewed = new Set(getRecentProductIds());
  const preferredCategories = recent.map(p => String(p.category || "").toLowerCase());
  return products.filter(p => productStock(p) > 0 && !viewed.has(String(p.id)))
    .sort((a, b) => Number(preferredCategories.includes(String(b.category || "").toLowerCase())) - Number(preferredCategories.includes(String(a.category || "").toLowerCase())))
    .slice(0, 12);
}
function renderProductDiscovery() {
  const recentSection = $("recentlyViewedSection");
  const recommendedSection = $("recommendedProductsSection");
  if (!recentSection || !recommendedSection) return;
  const recent = getRecentProductIds().map(productById).filter(p => p && (selectedDepartment === "all" || (p.department || "general") === selectedDepartment));
  const suggestions = getRecommendedProducts().filter(p => selectedDepartment === "all" || (p.department || "general") === selectedDepartment);
  recentSection.classList.toggle("hidden", !recent.length);
  $("recentlyViewedGrid").innerHTML = recent.slice(0, 8).map(discoveryProductCard).join("");
  recommendedSection.classList.toggle("hidden", !suggestions.length);
  $("recommendedProductsGrid").innerHTML = suggestions.slice(0, 8).map(discoveryProductCard).join("");
}
function openDiscoveryPage(type) {
  const isRecent = type === "recent";
  const items = (isRecent ? getRecentProductIds().map(productById).filter(Boolean) : getRecommendedProducts()).filter(p => selectedDepartment === "all" || (p.department || "general") === selectedDepartment);
  $("discoveryPageTitle").textContent = isRecent ? "Recently Viewed 👁" : "Recommended For You 👽";
  $("discoveryPageGrid").innerHTML = items.length ? items.map(discoveryProductCard).join("") : `<div class="summary"><p>No products to show yet.</p></div>`;
  show("discoveryView");
  window.scrollTo({top:0, behavior:"auto"});
}

function renderDepartmentShop(dept) {
  const isChicken = dept === "chicken";
  const host = $(isChicken ? "chickenProducts" : "solarProducts");
  const catsHost = $(isChicken ? "chickenCategories" : "solarCategories");
  const count = $(isChicken ? "chickenCount" : "solarCount");
  if (!host || !catsHost) return;
  const rows = products.filter(p => (p.department || "general") === dept);
  const cats = ["All", ...new Set(rows.map(p => p.category).filter(Boolean))];
  if (!cats.includes(departmentCategory[dept])) departmentCategory[dept] = "All";
  catsHost.innerHTML = cats.map(c => `<button type="button" class="${departmentCategory[dept] === c ? "active" : ""}" data-shop-dept="${dept}" data-shop-cat="${esc(c)}">${esc(c)}</button>`).join("");
  const filtered = rows.filter(p => departmentCategory[dept] === "All" || p.category === departmentCategory[dept]);
  count.textContent = `${filtered.length} product(s)`;
  host.innerHTML = filtered.length ? filtered.map(p => `<article class="card"><button class="departmentProductImage" type="button" data-product="${esc(p.id)}"><img src="${esc(imageOrFallback(p.image_url))}" alt="${esc(p.name)}" loading="lazy"></button><div class="cardBody"><div class="muted">${esc(p.category || (isChicken ? "Chicken" : "Solar"))}</div><h3>${esc(p.name)}</h3><p class="departmentCardDescription">${esc(p.description || "")}</p><div class="price">${money(p.price)}</div><div class="stockBadge ${productStock(p)>0?"inStock":"outStock"}">${productStock(p)>0?"● In Stock":"Out of Stock"}</div><button class="primary" type="button" data-product="${esc(p.id)}" ${productStock(p)<1?"disabled":""}>View Details</button></div></article>`).join("") : `<div class="summary"><h3>No ${isChicken?"chicken":"solar"} products available yet</h3><p>New products will appear here when the store owner adds them.</p></div>`;
}

function renderProducts() {
  const chooser = $("departmentChooser");
  const shopBar = $("departmentShopBar");
  if (chooser) chooser.classList.toggle("hidden", selectedDepartment !== "all");
  if (shopBar) shopBar.classList.toggle("hidden", selectedDepartment === "all");
  const deptNames = { all: "Choose a Department", chicken: "🐔 BIG ALIEN CHICKEN", solar: "☀️ BIG ALIEN SOLAR", general: "🛍️ GENERAL STORE" };
  if ($("shopTitle")) $("shopTitle").textContent = deptNames[selectedDepartment] || "Products";
  if ($("departmentShopTitle")) $("departmentShopTitle").textContent = deptNames[selectedDepartment] || "Products";
  let list = products.filter(
    (p) =>
      (selectedDepartment === "all" || (p.department || "general") === selectedDepartment) &&
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
            `<article class="card"><button class="productImageOpen" type="button" data-product="${esc(p.id)}" aria-label="View ${esc(p.name)}" style="display:block;width:100%;padding:0;border:0;background:transparent;cursor:pointer;line-height:0"><img src="${esc( imageOrFallback(p.image_url) )}" alt="${esc( p.name )}" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;cursor:pointer"></button><div class="cardBody"><div class="muted">${esc( p.category )}</div><h3>${esc(p.name)}</h3><div class="price">${money( p.price )}</div><div class="stockBadge ${p.stock > 0 ? "inStock" : "outStock"}">${p.stock > 0 ? "● In Stock" : "Out of Stock"}</div><button class="primary" data-product="${esc(p.id)}" ${ productStock(p) < 1 ? "disabled" : "" }>View / Buy</button><button class="secondary" type="button" data-wishlist-toggle="${esc(p.id)}">${getWishlist().includes(String(p.id)) ? "♥ Saved" : "♡ Save to Wishlist"}</button></div></article>`
        )
        .join("")
    : `<div class="summary"><h3>No products found</h3><p>Try another category or search.</p></div>`;
  renderProductDiscovery();
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
function productImages(p) {
  const list = Array.isArray(p?.images) ? p.images.filter(Boolean) : [];
  if (p?.image_url && !list.includes(p.image_url)) list.unshift(p.image_url);
  return list.length ? list : [imageOrFallback(p?.image_url)];
}
function needsVariants(p) {
  return /clothes|clothing|shoe|men|women|apparel|wear|fashion/i.test(String(p?.category || ""));
}
let activeProductImages = [];
function openProduct(id) {
  const p = productById(id);
  if (!p) return;
  rememberViewedProduct(p.id);
  renderProductDiscovery();

  const images = productImages(p);
  activeProductImages = images;
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  const colors = Array.isArray(p.colors) ? p.colors : [];
  const variants = needsVariants(p);
  const missingVariantSetup = variants && (!sizes.length || !colors.length);
  const inStock = productStock(p) > 0;

  productReturnView = currentView === "chickenShopView" || currentView === "solarShopView" ? currentView : "homeView";
  show("productView");
  $("productView").innerHTML = `
    <button class="secondary productBackButton" id="productBackBtn" type="button">← Back to products</button>
    <div class="productDetail">
      <div class="productGallery">
        <div class="productMainImageWrap">
          <img id="productMainImage" src="${esc(images[0])}" alt="${esc(p.name)}">
          <span class="productPhotoCount">${images.length} photo${images.length === 1 ? "" : "s"}</span>
        </div>
        ${images.length > 1 ? `
          <div class="productImageThumbs" aria-label="Product photos">
            ${images.map((url, i) => `
              <button type="button" class="productThumb ${i === 0 ? "active" : ""}" data-product-image="${i}" aria-label="View product photo ${i + 1}" aria-pressed="${i === 0}">
                <img src="${esc(url)}" alt="${esc(p.name)} photo ${i + 1}">
              </button>
            `).join("")}
          </div>` : ""}
      </div>

      <div class="productInfo">
        <div class="productCategory">${esc(p.category || "Product")}</div>
        <h1>${esc(p.name)}</h1>
        <div class="productPrice">${money(p.price)}</div>
        <div class="productAvailability ${inStock ? "available" : "unavailable"}">
          <span class="availabilityDot"></span>${inStock ? "In Stock" : "Out of Stock"}
        </div>
        <div class="productDescription">
          <h3>Product details</h3>
          <p>${esc(p.description || "Contact us on WhatsApp if you need more information about this product.")}</p>
        </div>

        ${missingVariantSetup ? `
          <div class="productSetupNotice">Size and color options are not yet configured for this item. Please contact the store before ordering.</div>
        ` : ""}

        ${variants && !missingVariantSetup ? `
          <div class="productOptions">
            ${sizes.length ? `<label>Choose size<select id="buySize" required><option value="">Select size</option>${sizes.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select></label>` : ""}
            ${colors.length ? `<label>Choose color<select id="buyColor" required><option value="">Select color</option>${colors.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label>` : ""}
          </div>` : ""}

        <div class="productQuantity">
          <span>Quantity</span>
          <div class="quantityStepper">
            <button type="button" id="productQtyMinus" aria-label="Decrease quantity" ${!inStock ? "disabled" : ""}>−</button>
            <input id="buyQty" type="number" min="1" max="${Math.max(1, productStock(p))}" value="1" inputmode="numeric" aria-label="Quantity">
            <button type="button" id="productQtyPlus" aria-label="Increase quantity" ${!inStock ? "disabled" : ""}>+</button>
          </div>
        </div>

        <div class="productActions">
          <button class="primary" id="addToCart" ${!inStock || missingVariantSetup ? "disabled" : ""}>🛒 Add to Cart</button>
          <button class="secondary productBuyNow" id="buyNow" ${!inStock || missingVariantSetup ? "disabled" : ""}>Buy Now</button>
          <button class="secondary" type="button" data-wishlist-toggle="${esc(p.id)}">${getWishlist().includes(String(p.id)) ? "♥ Saved to Wishlist" : "♡ Save to Wishlist"}</button>
        </div>

        <div class="productTrust">
          <div><span>🚚</span><p><b>Reliable delivery</b><small>Delivery updates are available after ordering.</small></p></div>
          <div><span>🔒</span><p><b>Secure checkout</b><small>Your account and order details stay protected.</small></p></div>
          <div><span>💬</span><p><b>Need help?</b><small><a href="https://wa.me/2347025136166" target="_blank" rel="noopener">Chat with customer service</a></small></p></div>
        </div>
      </div>
    </div>
    <section class="productReviews" id="productReviews" aria-live="polite">
      <h2>Customer ratings & reviews</h2>
      <div id="productReviewSummary" class="reviewSummary">Loading ratings…</div>
      <div id="productReviewFormArea"></div>
      <div id="productReviewList" class="reviewList"></div>
    </section>`;

  loadProductReviews(p.id);

  $("productBackBtn").onclick = () => {
    show(productReturnView);
    if (productReturnView === "chickenShopView") renderDepartmentShop("chicken");
    else if (productReturnView === "solarShopView") renderDepartmentShop("solar");
    else renderProducts();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const qtyInput = $("buyQty");
  $("productQtyMinus").onclick = () => {
    qtyInput.value = Math.max(1, Number(qtyInput.value || 1) - 1);
  };
  $("productQtyPlus").onclick = () => {
    const max = Number(qtyInput.max) || 1;
    qtyInput.value = Math.min(max, Math.max(1, Number(qtyInput.value || 1) + 1));
  };
  qtyInput.addEventListener("change", () => {
    const max = Number(qtyInput.max) || 1;
    qtyInput.value = Math.min(max, Math.max(1, Math.floor(Number(qtyInput.value) || 1)));
  });

  const selectedVariants = () => {
    if (missingVariantSetup) {
      alert("The store owner must configure sizes and colors for this clothing/shoe item before it can be ordered.");
      return null;
    }
    const size = $("buySize")?.value || "";
    const color = $("buyColor")?.value || "";
    if (variants && sizes.length && !size) {
      alert("Please select a size first.");
      return null;
    }
    if (variants && colors.length && !color) {
      alert("Please select a color first.");
      return null;
    }
    return { size, color };
  };

  const addSelected = () => {
    const v = selectedVariants();
    if (!v) return false;
    const q = Number(qtyInput.value);
    if (!Number.isInteger(q) || q < 1 || q > productStock(p)) {
      alert("Please enter a valid quantity within the available stock.");
      return false;
    }
    addCart(p, q, v);
    return true;
  };

  $("addToCart").onclick = () => {
    if (addSelected()) {
      show("cartView");
      renderCart();
    }
  };
  $("buyNow").onclick = () => {
    if (addSelected()) {
      show("checkoutView");
      prefillCheckout();
    }
  };
}
async function loadProductReviews(productId) {
  const summary = $("productReviewSummary"), formArea = $("productReviewFormArea"), list = $("productReviewList");
  if (!summary || !formArea || !list || !sb) return;
  summary.textContent = "Loading ratings…";
  const { data: reviews, error } = await sb.from("product_reviews")
    .select("id,rating,review_text,created_at")
    .eq("product_id", productId).eq("status", "approved")
    .order("created_at", { ascending: false }).limit(50);
  if (error) {
    summary.textContent = "Reviews are temporarily unavailable.";
    console.error("Product reviews:", error);
  } else {
    const rows = reviews || [];
    const average = rows.length ? rows.reduce((sum, r) => sum + Number(r.rating || 0), 0) / rows.length : 0;
    summary.innerHTML = rows.length
      ? `<strong>${average.toFixed(1)} / 5</strong> <span class="reviewStars">${"★".repeat(Math.round(average))}${"☆".repeat(5-Math.round(average))}</span> <span class="muted">${rows.length} approved review${rows.length===1?"":"s"}</span>`
      : `<span class="muted">No approved reviews yet. Be the first verified customer to review this product.</span>`;
    list.innerHTML = rows.length ? rows.map(r => `<article class="reviewCard"><div class="reviewCardHead"><b>Verified customer</b><span class="reviewStars">${"★".repeat(Number(r.rating))}${"☆".repeat(5-Number(r.rating))}</span></div><p>${esc(r.review_text)}</p><small class="muted">${new Date(r.created_at).toLocaleDateString()}</small></article>`).join("") : "";
  }
  if (!user) {
    formArea.innerHTML = `<p class="muted">Sign in and complete a purchase to leave a review.</p>`;
    return;
  }
  const { data: orders, error: ordersError } = await sb.from("orders").select("id")
    .eq("user_id", user.id).eq("payment_status", "paid").eq("order_status", "delivered");
  let eligibleOrderIds = [];
  if (!ordersError && orders?.length) {
    const ids = orders.map(o => o.id);
    const { data: items, error: itemsError } = await sb.from("order_items").select("order_id")
      .eq("product_id", productId).in("order_id", ids);
    if (!itemsError) eligibleOrderIds = [...new Set((items || []).map(x => x.order_id))];
  }
  if (!eligibleOrderIds.length) {
    formArea.innerHTML = `<p class="muted">Reviews are available after you have purchased this product and your order is marked paid and delivered.</p>`;
    return;
  }
  formArea.innerHTML = `<form id="submitProductReview" class="reviewForm"><h3>Write a review</h3><label for="newReviewRating">Your rating</label><select id="newReviewRating" required><option value="">Choose stars</option><option value="5">★★★★★ — Excellent</option><option value="4">★★★★ — Very good</option><option value="3">★★★ — Good</option><option value="2">★★ — Fair</option><option value="1">★ — Poor</option></select><label for="newReviewText">Your experience</label><textarea id="newReviewText" minlength="3" maxlength="2000" rows="4" placeholder="Tell other customers about this product…" required></textarea><button class="primary" type="submit">Submit review</button><p id="newReviewMessage" class="muted" role="status">Your review will appear after owner approval.</p></form>`;
  $("submitProductReview").onsubmit = async (e) => {
    e.preventDefault();
    const rating = Number($("newReviewRating").value), reviewText = $("newReviewText").value.trim();
    if (!rating || reviewText.length < 3) return;
    const button = e.currentTarget.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Submitting…";
    const { error: insertError } = await sb.from("product_reviews").insert({
      product_id: productId, order_id: eligibleOrderIds[0], user_id: user.id,
      rating, review_text: reviewText, status: "pending"
    });
    if (insertError) {
      $("newReviewMessage").textContent = insertError.code === "23505" ? "You have already reviewed this product from this order." : `Could not submit review: ${insertError.message}`;
      button.disabled = false; button.textContent = "Submit review"; return;
    }
    formArea.innerHTML = `<p class="reviewSuccess">Thank you! Your review has been submitted and is waiting for owner approval.</p>`;
  };
}

function productStock(p, fallback = 0) {
  const raw = p?.stock ?? fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
function addCart(p, q, variants = {}) {
  if (!p) return;
  q = Math.max(1, Math.floor(Number(q) || 1));
  const stock = productStock(p);
  if (stock < 1) {
    alert("This product is currently out of stock. Please contact the store owner.");
    return;
  }
  const size = variants.size || "", color = variants.color || "";
  const x = cart.find((item) => String(item.id) === String(p.id) && (item.size || "") === size && (item.color || "") === color);
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
    x.images = productImages(p);
  } else {
    cart.push({
      id: p.id,
      qty: Math.min(stock, q),
      name: p.name,
      price: Number(p.price) || 0,
      image_url: p.image_url,
      images: productImages(p),
      size, color, stock,
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
    return `<div class="cartRow"><img src="${esc(imageOrFallback(item.image_url))}" alt="${esc(item.name)}"><div class="cartProductInfo" style="flex:1;min-width:100px"><b>${esc(item.name)}</b>${item.size ? `<div>Size: ${esc(item.size)}</div>` : ""}${item.color ? `<div>Color: ${esc(item.color)}</div>` : ""}<div>${money(item.price)} × ${qty}</div><small class="muted">${stock} available</small></div><button class="secondary" type="button" data-minus="${esc(item.id)}" data-size="${esc(item.size || "")}" data-color="${esc(item.color || "")}" aria-label="Decrease ${esc(item.name)} quantity" ${qty <= 1 ? "disabled" : ""}>−</button><b aria-label="Quantity">${qty}</b><button class="secondary" type="button" data-plus="${esc(item.id)}" data-size="${esc(item.size || "")}" data-color="${esc(item.color || "")}" aria-label="Increase ${esc(item.name)} quantity" ${stock <= qty ? "" : ""}>+</button><button class="danger" type="button" data-remove="${esc(item.id)}" data-size="${esc(item.size || "")}" data-color="${esc(item.color || "")}">Remove</button></div>`;
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
  const rewardKey = checkoutRewardChoice().points;
  return user && cartKey ? `bav_payment_report_${user.id}_${cartKey}_rewards_${rewardKey}` : "";
}
function setupCheckoutPaymentGate() {
  const form = $("checkoutForm");
  if (!form || $("bavPaymentGate")) return;
  const panel = document.createElement("div");
  panel.id = "bavPaymentGate";
  panel.className = "bankBox";
  panel.innerHTML = `<b>Bank transfer</b><p>Account name: Abel Philip<br>Account number: <span id="bavAccountNo">6714306196</span> <button class="secondary" type="button" id="bavCopyAccount">Copy</button><br>Bank: Moniepoint MFB</p><p>Transfer <b id="bavTransferAmount">the checkout total</b>, then tap <b>I Have Paid</b>. This reports your payment; the store must still confirm receipt.</p><button class="primary" type="button" id="bavReportPayment">I Have Paid</button><p id="bavPaymentMsg" class="msg" aria-live="polite">Place Order unlocks after you submit your payment report.</p>`;
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
  const syncPaymentChoice = () => {
    const bank = $("coPayment").value === "bank_transfer";
    const paystack = $("coPayment").value === "paystack";
    $("bavPaymentGate").classList.toggle("hidden", !bank);
    if (submit) {
      submit.hidden = bank ? !sessionStorage.getItem(checkoutReportKey()) : false;
      submit.disabled = bank ? !sessionStorage.getItem(checkoutReportKey()) : false;
    }
    if (paystack) msg("checkoutMsg", "Pay securely with Paystack. Tap Place Order to continue to the payment page.");
    else if (bank) $("checkoutMsg").textContent = "";
  };
  $("coPayment")?.addEventListener("change", syncPaymentChoice);
  syncPaymentChoice();
  const rewardsCheckbox = $("applyRewardsPoints");
  if (rewardsCheckbox && !rewardsCheckbox.dataset.bound) {
    rewardsCheckbox.dataset.bound = "1";
    rewardsCheckbox.addEventListener("change", () => {
      renderCheckoutRewards();
      const submit = $("bavPlaceOrder");
      if ($("coPayment")?.value === "bank_transfer" && submit) {
        const hasReport = Boolean(sessionStorage.getItem(checkoutReportKey()));
        submit.hidden = !hasReport;
        submit.disabled = !hasReport;
        if (!hasReport && $("bavPaymentMsg")) $("bavPaymentMsg").textContent = "The amount changed. Please transfer the updated total and tap I Have Paid again.";
      }
    });
  }
  renderCheckoutRewards();
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
  const amount = checkoutAmounts().total;
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
      p_message: `${$("coName").value.trim()} (${ $("coEmail")?.value.trim() || user.email || "no email" }) reports a transfer of ${money( amount )}. Check Moniepoint before confirming.`,
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
    if ($("coName") && !$("coName").value.trim()) $("coName").value = profile.full_name || "";
    if ($("coPhone") && !$("coPhone").value.trim()) $("coPhone").value = profile.phone || "";
  }
  if ($("coEmail") && user && !$("coEmail").value.trim()) {
    $("coEmail").value = user.email || "";
  }
  const savedAddress = user ? (localStorage.getItem(`big_alien_address_${user.id}`) || "") : "";
  if ($("coAddress") && !$("coAddress").value.trim() && savedAddress) {
    $("coAddress").value = savedAddress;
  }
  const emailToggle = $("useDifferentCheckoutEmail");
  const emailInput = $("coEmail");
  if (emailToggle && emailInput && !emailToggle.dataset.bound) {
    emailToggle.dataset.bound = "1";
    emailToggle.addEventListener("change", () => {
      if (!emailToggle.checked && user?.email) emailInput.value = user.email;
      emailInput.readOnly = !emailToggle.checked;
      emailInput.required = true;
      if (emailToggle.checked) emailInput.focus();
    });
    emailInput.readOnly = !emailToggle.checked;
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

function ensureRewardsDashboard() {
  const existing = $("rewardsDashboard");
  if (existing) return existing;

  const balanceCard = document.querySelector("#rewardsView .rewardsBalanceCard");
  if (!balanceCard) return null;

  if (!$("rewardsDashboardStyles")) {
    const style = document.createElement("style");
    style.id = "rewardsDashboardStyles";
    style.textContent = `
      .rewardsDashboard{margin:20px 0 8px;display:grid;gap:12px}
      .rewardsDashboardTitle{margin:0;font-size:19px;font-weight:800}
      .rewardsStatGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .rewardsStatCard{min-width:0;padding:14px;border:1px solid var(--border,#dce4ef);border-radius:14px;background:var(--card,#fff);display:grid;gap:7px}
      .rewardsStatCard small{color:var(--muted,#6b7280);font-size:12px;line-height:1.35}
      .rewardsStatCard strong{font-size:clamp(18px,4.8vw,23px);line-height:1.2;overflow-wrap:anywhere}
      .rewardsProgressCard{padding:16px;border:1px solid var(--border,#dce4ef);border-radius:14px;background:var(--card,#fff)}
      .rewardsProgressHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .rewardsProgressHead b{font-size:15px}
      .rewardsProgressHead strong{color:#075bea;white-space:nowrap}
      .rewardsProgressTrack{height:10px;overflow:hidden;border-radius:999px;background:var(--bg,#eef2f7)}
      .rewardsProgressFill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#075bea,#2b83f6);transition:width .25s ease}
      .rewardsProgressText{margin:9px 0 0;color:var(--muted,#6b7280);font-size:13px;line-height:1.5}
      body.dark .rewardsStatCard,body.dark .rewardsProgressCard{background:var(--card,#172033);border-color:var(--border,#344258);color:var(--ink,#f1f5fb)}
      body.dark .rewardsStatCard small,body.dark .rewardsProgressText{color:var(--muted,#bdc9da)}
      @media(max-width:360px){.rewardsStatGrid{grid-template-columns:1fr}.rewardsStatCard{padding:12px}}
    `;
    document.head.appendChild(style);
  }

  const dashboard = document.createElement("section");
  dashboard.id = "rewardsDashboard";
  dashboard.className = "rewardsDashboard";
  dashboard.setAttribute("aria-label", "Your loyalty overview");
  dashboard.innerHTML = `
    <h3 class="rewardsDashboardTitle">Your loyalty overview</h3>
    <div class="rewardsStatGrid">
      <article class="rewardsStatCard"><small>Total points earned</small><strong id="rewardsTotalEarned">—</strong></article>
      <article class="rewardsStatCard"><small>Points redeemed</small><strong id="rewardsTotalRedeemed">—</strong></article>
      <article class="rewardsStatCard"><small>Completed orders</small><strong id="rewardsCompletedOrders">—</strong></article>
      <article class="rewardsStatCard"><small>Total spent on paid orders</small><strong id="rewardsTotalSpent">—</strong></article>
    </div>
    <div class="rewardsProgressCard">
      <div class="rewardsProgressHead"><b>Progress to your next ₦50 reward</b><strong id="rewardsProgressPercent">0%</strong></div>
      <div class="rewardsProgressTrack" role="progressbar" aria-label="Progress toward next reward" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="rewardsProgressBar"><div class="rewardsProgressFill" id="rewardsProgressFill"></div></div>
      <p class="rewardsProgressText" id="rewardsProgressText">Earn 100 points to unlock your next ₦50 reward.</p>
    </div>`;
  balanceCard.insertAdjacentElement("afterend", dashboard);
  return dashboard;
}

async function loadCustomerRewards() {
  const balanceEl = $("rewardsBalance");
  const historyEl = $("rewardsHistory");
  const noteEl = $("rewardsMessage");
  if (!sb || !balanceEl || !historyEl) return;

  const dashboard = ensureRewardsDashboard();
  const ruleNote = document.querySelector("#rewardsView .rewardsRule small");
  if (ruleNote) ruleNote.textContent = "At checkout, select the option to use 100 points for ₦50 off. Your available points are shown above.";

  balanceEl.textContent = "Loading…";
  historyEl.innerHTML = '<p class="muted">Loading your rewards history…</p>';
  if (noteEl) noteEl.textContent = "";
  ["rewardsTotalEarned", "rewardsTotalRedeemed", "rewardsCompletedOrders", "rewardsTotalSpent"].forEach((id) => {
    if ($(id)) $(id).textContent = "Loading…";
  });
  if ($("rewardsProgressText")) $("rewardsProgressText").textContent = "Calculating your reward progress…";

  // Resolve the current authenticated customer before requesting private records.
  const { data: authData, error: authError } = await sb.auth.getUser();
  const rewardsUser = authData?.user || user;
  if (authError || !rewardsUser?.id) {
    balanceEl.textContent = "Unavailable";
    historyEl.innerHTML = '<p class="muted">Please sign in again to view your rewards.</p>';
    if (dashboard) dashboard.querySelectorAll(".rewardsStatCard strong").forEach((el) => { el.textContent = "—"; });
    if ($("rewardsProgressText")) $("rewardsProgressText").textContent = "Sign in again to view your reward progress.";
    return;
  }
  user = rewardsUser;

  // Orders are read only for the signed-in customer. Spending totals include
  // confirmed paid orders; completed orders must also be marked delivered.
  const [{ data: account, error: accountError }, { data: orders, error: ordersError }] = await Promise.all([
    sb.from("loyalty_accounts").select("points_balance").eq("user_id", rewardsUser.id).maybeSingle(),
    sb.from("orders").select("id,total,payment_status,order_status,created_at").eq("user_id", rewardsUser.id).order("created_at", { ascending: false })
  ]);

  // Fetch the full points ledger in pages so the earned/redeemed totals are
  // not limited to only the latest 100 history rows.
  const transactions = [];
  let historyError = null;
  const pageSize = 500;
  const maxLedgerRows = 10000;
  for (let offset = 0; offset < maxLedgerRows; offset += pageSize) {
    const result = await sb.from("loyalty_transactions")
      .select("id,transaction_type,points_delta,amount_ngn,description,created_at")
      .eq("user_id", rewardsUser.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (result.error) {
      historyError = result.error;
      break;
    }
    const batch = result.data || [];
    transactions.push(...batch);
    if (batch.length < pageSize) break;
  }

  if (accountError || historyError) {
    balanceEl.textContent = "Unavailable";
    historyEl.innerHTML = `<p class="muted">Rewards are temporarily unavailable: ${esc((accountError || historyError).message)}</p>`;
    if (dashboard) dashboard.querySelectorAll(".rewardsStatCard strong").forEach((el) => { el.textContent = "—"; });
    if ($("rewardsProgressText")) $("rewardsProgressText").textContent = "Your reward progress is temporarily unavailable.";
    return;
  }

  const ledgerBalance = transactions.reduce((sum, tx) => sum + Number(tx.points_delta || 0), 0);
  const storedBalance = Number(account?.points_balance || 0);
  const points = Math.max(0, account ? storedBalance : ledgerBalance);
  balanceEl.textContent = points.toLocaleString("en-NG");

  const totalEarned = transactions.reduce((sum, tx) =>
    sum + (tx.transaction_type === "earned" ? Math.max(0, Number(tx.points_delta || 0)) : 0), 0);
  const totalRedeemed = transactions.reduce((sum, tx) =>
    sum + (tx.transaction_type === "redeemed" ? Math.abs(Number(tx.points_delta || 0)) : 0), 0);

  const customerOrders = orders || [];
  const paidOrders = customerOrders.filter((order) => String(order.payment_status || "").toLowerCase() === "paid");
  const completedOrders = paidOrders.filter((order) => String(order.order_status || "").toLowerCase() === "delivered");
  const totalSpent = paidOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0)), 0);

  if ($("rewardsTotalEarned")) $("rewardsTotalEarned").textContent = `${totalEarned.toLocaleString("en-NG")} pts`;
  if ($("rewardsTotalRedeemed")) $("rewardsTotalRedeemed").textContent = `${totalRedeemed.toLocaleString("en-NG")} pts`;
  if ($("rewardsCompletedOrders")) $("rewardsCompletedOrders").textContent = ordersError ? "—" : completedOrders.length.toLocaleString("en-NG");
  if ($("rewardsTotalSpent")) $("rewardsTotalSpent").textContent = ordersError ? "—" : money(totalSpent);

  const pointsProgress = points % 100;
  const pointsToNextReward = pointsProgress === 0 ? 100 : 100 - pointsProgress;
  const progressPercent = pointsProgress;
  if ($("rewardsProgressPercent")) $("rewardsProgressPercent").textContent = `${progressPercent}%`;
  if ($("rewardsProgressBar")) $("rewardsProgressBar").setAttribute("aria-valuenow", String(progressPercent));
  if ($("rewardsProgressFill")) $("rewardsProgressFill").style.width = `${progressPercent}%`;
  if ($("rewardsProgressText")) {
    const redeemable = Math.floor(points / 100);
    let progressText = `Earn ${pointsToNextReward} more point${pointsToNextReward === 1 ? "" : "s"} to reach your next ₦50 reward.`;
    if (redeemable > 0) progressText = `You have ${redeemable} ₦50 reward${redeemable === 1 ? "" : "s"} available to redeem. Earn ${pointsToNextReward} more points to unlock the next one.`;
    if (ordersError) progressText += " Order totals could not be loaded right now.";
    $("rewardsProgressText").textContent = progressText;
  }

  const availableDiscount = Math.floor(points / 100) * 50;
  if (noteEl) noteEl.textContent = points >= 100
    ? `Your points are worth up to ${money(availableDiscount)} in reward discounts. At checkout, redeem 100 points for ₦50 off an order.`
    : `Earn ${100 - points} more points to unlock your first ₦50 reward.`;

  if (!transactions.length) {
    historyEl.innerHTML = '<p class="muted">No rewards activity yet. Earn points when your orders are paid and delivered.</p>';
    return;
  }
  historyEl.innerHTML = transactions.slice(0, 100).map((tx) => {
    const positive = Number(tx.points_delta) > 0;
    const label = tx.transaction_type === "earned" ? "Points earned" : tx.transaction_type === "redeemed" ? "Points redeemed" : "Points adjustment";
    return `<article class="rewardHistoryRow"><div><b>${label}</b><small>${esc(tx.description || "BIG ALIEN Rewards")}</small><small>${tx.created_at ? new Date(tx.created_at).toLocaleString() : ""}</small></div><strong class="${positive ? "rewardPositive" : "rewardNegative"}">${positive ? "+" : ""}${Number(tx.points_delta).toLocaleString("en-NG")} pts</strong></article>`;
  }).join("");
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
  const photoKey = `big_alien_profile_photo_${user.id}`;
  const photoData = localStorage.getItem(photoKey) || "";
  const paintPhoto = (id) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = photoData ? `<img src="${photoData}" alt="Customer profile photo">` : "👤";
  };
  paintPhoto("profilePhotoPreview");
  paintPhoto("accountAvatarPreview");
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
function checkoutRewardChoice() {
  const enabled = Boolean($("applyRewardsPoints")?.checked);
  const points = enabled ? 100 : 0;
  const discount = enabled ? 50 : 0;
  return { points, discount };
}
function checkoutAmounts() {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const shippingFee = 3000;
  const reward = checkoutRewardChoice();
  const discount = Math.min(reward.discount, subtotal + shippingFee);
  return { subtotal, shippingFee, discount, rewardPoints: discount ? reward.points : 0, total: Math.max(0, subtotal + shippingFee - discount) };
}
function renderCheckoutRewards() {
  const box = $("checkoutRewards");
  if (!box) return;
  const checkbox = $("applyRewardsPoints");
  const eligible = checkoutRewardBalance >= 100;
  if (checkbox) {
    checkbox.disabled = !eligible || checkoutRewardLoading;
    if (!eligible) checkbox.checked = false;
  }
  const amounts = checkoutAmounts();
  const balance = $("checkoutRewardsBalance");
  if (balance) balance.textContent = checkoutRewardLoading ? "Loading…" : `${checkoutRewardBalance.toLocaleString("en-NG")} points`;
  const note = $("checkoutRewardsNote");
  if (note) note.textContent = eligible ? "Use 100 points to get ₦50 off this order." : `You need ${Math.max(0, 100 - checkoutRewardBalance)} more points to redeem your first ₦50 reward.`;
  const discountLine = $("checkoutRewardDiscount");
  if (discountLine) discountLine.textContent = `−${money(amounts.discount)}`;
  const totalLine = $("checkoutFinalTotal");
  if (totalLine) totalLine.textContent = money(amounts.total);
  const subtotalLine = $("checkoutSubtotal");
  if (subtotalLine) subtotalLine.textContent = money(amounts.subtotal);
  const shippingLine = $("checkoutShipping");
  if (shippingLine) shippingLine.textContent = money(amounts.shippingFee);
  const reportAmount = $("bavTransferAmount");
  if (reportAmount) reportAmount.textContent = money(amounts.total);
}
async function loadCheckoutRewards() {
  const box = $("checkoutRewards");
  if (!box || !sb || !user) return;
  checkoutRewardLoading = true;
  renderCheckoutRewards();
  const { data, error } = await sb.from("loyalty_accounts").select("points_balance").eq("user_id", user.id).maybeSingle();
  checkoutRewardLoading = false;
  if (error) {
    checkoutRewardBalance = 0;
    const note = $("checkoutRewardsNote");
    if (note) note.textContent = "Rewards are temporarily unavailable. You can continue checkout without a discount.";
  } else {
    checkoutRewardBalance = Math.max(0, Number(data?.points_balance || 0));
  }
  renderCheckoutRewards();
}

async function startPaystackCheckout() {
  if (!user) return msg("checkoutMsg", "Please sign in first.");
  if (!cart.length) return msg("checkoutMsg", "Cart is empty.");
  const button = $("bavPlaceOrder") || $("checkoutForm")?.querySelector('button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = "Connecting to Paystack…"; }
  msg("checkoutMsg", "Preparing your secure Paystack payment…");
  const amounts = checkoutAmounts();
  const { subtotal, shippingFee, total, discount, rewardPoints } = { ...amounts, discount: amounts.discount, rewardPoints: amounts.rewardPoints };
  if (rewardPoints && checkoutRewardBalance < rewardPoints) {
    msg("checkoutMsg", "Your rewards balance has changed. Refresh checkout and try again.");
    if (button) { button.disabled = false; button.textContent = "Place Order"; }
    return;
  }
  const payload = {
    user_id: user.id, subtotal, shipping_fee: shippingFee, total, reward_points_used: rewardPoints, reward_discount: discount,
    payment_method: "paystack", payment_status: "pending", order_status: "processing",
    customer_name: $("coName").value.trim(), customer_phone: $("coPhone").value.trim(),
    delivery_address: $("coAddress").value.trim(),
    notes: `Contact email for this order: ${$("coEmail").value.trim()}. Awaiting Paystack payment verification.`,
  };
  let order;
  try {
    const { data, error } = await sb.from("orders").insert(payload).select().single();
    if (error) throw error;
    order = data;
    const items = cart.map((x) => ({ order_id: order.id, product_id: x.id, product_name: x.name,
      product_price: x.price, quantity: x.qty, image_url: x.image_url, size: x.size || null, color: x.color || null }));
    const { error: itemError } = await sb.from("order_items").insert(items);
    if (itemError) { await sb.from("orders").delete().eq("id", order.id); throw itemError; }
    await sb.from("shipment_updates").insert({ order_id: order.id, status: "Payment pending", message: "Waiting for Paystack payment confirmation." });
    const callbackUrl = `${window.location.origin}${window.location.pathname}?paystack_order_id=${encodeURIComponent(order.id)}`;
    const { data: payment, error: initError } = await sb.functions.invoke("paystack-initialize", {
      body: { order_id: order.id, callback_url: callbackUrl }
    });
    if (initError) throw initError;
    if (!payment?.authorization_url) throw new Error(payment?.error || "Paystack did not return a payment link.");
    sessionStorage.setItem("bav_paystack_pending_order", order.id);
    window.location.assign(payment.authorization_url);
  } catch (error) {
    console.error("Paystack checkout error:", error);
    msg("checkoutMsg", `Could not open Paystack: ${error.message || "Please try again."}`);
    if (button) { button.disabled = false; button.textContent = "Place Order"; }
  }
}

async function handlePaystackReturn() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("paystack_order_id") || sessionStorage.getItem("bav_paystack_pending_order");
  const reference = params.get("reference") || params.get("trxref");
  if (!orderId || !reference || !sb || !user) return;
  msg("checkoutMsg", "Verifying your Paystack payment securely…");
  try {
    const { data, error } = await sb.functions.invoke("paystack-verify", { body: { order_id: orderId, reference } });
    if (error) throw error;
    if (data?.success !== true && data?.status !== "success" && data?.verified !== true)
      throw new Error(data?.error || "Payment has not been confirmed. Do not pay again; contact the store if money was deducted.");
    const { data: order, error: orderError } = await sb.from("orders").select("id,total,customer_name,customer_phone").eq("id", orderId).eq("user_id", user.id).single();
    if (orderError) throw orderError;
    await sb.from("shipment_updates").insert({ order_id: orderId, status: "Payment confirmed", message: "Paystack payment verified successfully." });
    const { error: notifyError } = await sb.rpc("notify_admins_checkout_event", {
      p_title: "Paystack payment received", p_message: `Order ${orderId.slice(0, 8)}: ${order.customer_name || "Customer"} · ${order.customer_phone || ""} · ${money(order.total)}. Paystack payment verified.`, p_type: "new_order", p_order_id: orderId
    });
    if (notifyError) console.warn("Admin payment notification failed:", notifyError.message);
    await sendOrderEmail("new_order", orderId);
    sessionStorage.removeItem("bav_paystack_pending_order");
    cart = []; saveCart();
    window.history.replaceState({}, document.title, window.location.pathname);
    msg("checkoutMsg", "Payment confirmed! Your order has been placed.", true);
    setTimeout(() => openOrders(), 700);
  } catch (error) {
    console.error("Paystack verification error:", error);
    msg("checkoutMsg", `Payment verification needs attention: ${error.message || "Please check My Orders or contact the store before trying to pay again."}`);
  }
}

async function submitOrder(e) {
  e.preventDefault();
  if (!user) return msg("checkoutMsg", "Please sign in first.");
  if (!cart.length) return msg("checkoutMsg", "Cart is empty.");
  const paymentMethod = $("coPayment").value;
  const reportKey = checkoutReportKey();
  const reportId = reportKey ? sessionStorage.getItem(reportKey) : null;
  if (paymentMethod === "bank_transfer" && !reportId)
    return msg("checkoutMsg", "Transfer payment and tap “I Have Paid” before placing your order.");
  if (paymentMethod === "paystack") {
    return startPaystackCheckout();
  }
  if (paymentMethod !== "bank_transfer") return msg("checkoutMsg", "Please choose a valid payment method.");

  const amounts = checkoutAmounts();
  const { subtotal, shippingFee, total, discount, rewardPoints } = { ...amounts, discount: amounts.discount, rewardPoints: amounts.rewardPoints };
  if (rewardPoints && checkoutRewardBalance < rewardPoints) return msg("checkoutMsg", "Your rewards balance has changed. Refresh checkout and try again.");
  const payload = {
    user_id: user.id,
    subtotal,
    shipping_fee: shippingFee,
    total,
    reward_points_used: rewardPoints,
    reward_discount: discount,
    payment_method: "bank_transfer",
    payment_status: "pending",
    order_status: "processing",
    customer_name: $("coName").value.trim(),
    customer_phone: $("coPhone").value.trim(),
    delivery_address: $("coAddress").value.trim(),
    notes: `Contact email for this order: ${$("coEmail").value.trim()}. Customer reported payment; awaiting admin verification.`,
  };  const { data: o, error } = await sb
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
    size: x.size || null,
    color: x.color || null,
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
function orderTrackingStage(order, updates) {
  const latest = updates?.[0] || null;
  const current = `${order.order_status || ""} ${latest?.status || ""} ${latest?.message || ""}`.toLowerCase();
  if (/cancel|refund|return/.test(current)) return { terminal: true, label: "Cancelled / Returned", index: -1 };
  if (/delivered|successfully received|order complete/.test(current)) return { terminal: false, label: "Delivered", index: 4 };
  if (/ready for pickup|available for pickup|at pickup point|arrived at pickup/.test(current)) return { terminal: false, label: "Ready for pickup", index: 3 };
  if (/out for delivery|with rider|courier/.test(current)) return { terminal: false, label: "Out for delivery", index: 3 };
  if (/in transit|shipped|dispatched|on the way|departed/.test(current)) return { terminal: false, label: "Shipped", index: 2 };
  if (/processing|preparing|packed|confirmed|payment confirmed/.test(current)) return { terminal: false, label: "Processing", index: 1 };
  return { terminal: false, label: order.order_status || "Order received", index: 0 };
}

function renderOrderTimeline(stage) {
  if (stage.terminal) return `<div class="trackingTerminal"><b>⚠ ${esc(stage.label)}</b><p>Please contact customer service if you need help with this order.</p></div>`;
  const steps = ["Order received", "Processing", "Shipped", "Out for delivery", "Delivered"];
  return `<div class="trackingBlock"><div class="trackingHeading"><b>Delivery progress</b><span>${esc(stage.label)}</span></div><ol class="trackingTimeline">${steps.map((label, i) => `<li class="${i < stage.index ? "complete" : i === stage.index ? "current" : "pending"}"><span class="trackingDot">${i < stage.index ? "✓" : i + 1}</span><span class="trackingStepText"><b>${label}</b>${i === stage.index ? `<small>Current stage</small>` : ""}</span></li>`).join("")}</ol></div>`;
}

async function openOrders() {
  show("ordersView");
  const list = $("ordersList");
  if (!sb || !user || !list) return;

  // Render immediately; notifications must not delay the order screen.
  list.innerHTML = `<div class="summary" role="status">Loading your orders…</div>`;
  loadCustomerNotifications().catch((err) =>
    console.warn("Customer notifications could not be refreshed:", err)
  );

  const { data: orders, error } = await sb
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<div class="summary">${esc(error.message)}</div>`;
    return;
  }
  if (!orders?.length) {
    customerOrdersCache = [];
    customerOrderItemsCache = {};
    list.innerHTML = `<div class="summary">No orders yet. Your purchases and delivery updates will appear here.</div>`;
    return;
  }

  customerOrdersCache = orders;
  customerOrderItemsCache = {};
  const orderIds = orders.map((order) => order.id);

  // Fetch line items and shipment updates in parallel batches, not two
  // sequential requests per order.
  const [itemsResult, updatesResult] = await Promise.all([
    sb.from("order_items")
      .select("id,order_id,product_id,product_name,product_price,quantity,image_url,size,color")
      .in("order_id", orderIds),
    sb.from("shipment_updates")
      .select("*")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false })
  ]);

  const itemsByOrder = {};
  (itemsResult.data || []).forEach((item) => {
    (itemsByOrder[item.order_id] ||= []).push(item);
  });
  const updatesByOrder = {};
  (updatesResult.data || []).forEach((update) => {
    (updatesByOrder[update.order_id] ||= []).push(update);
  });

  let html = "";
  for (const o of orders) {
    const itemsError = itemsResult.error;
    const updatesError = updatesResult.error;
    const orderItems = itemsByOrder[o.id] || [];
    const updates = updatesByOrder[o.id] || [];
    customerOrderItemsCache[o.id] = orderItems;
    const latest = updates[0] || null;
    const stage = orderTrackingStage(o, updates);
    const pickup = /ready for pickup|available for pickup|at pickup point|arrived at pickup/i.test(
      `${o.order_status || ""} ${latest?.status || ""} ${latest?.message || ""}`
    );
    const itemList = orderItems.length
      ? `<div class="orderProducts"><h4>Items in this order</h4>${orderItems.map(item => `<div class="orderProductRow">${item.image_url ? `<img src="${esc(item.image_url)}" alt="${esc(item.product_name)}" loading="lazy" decoding="async">` : `<span class="orderProductPlaceholder">🛍️</span>`}<div class="orderProductDetails"><b>${esc(item.product_name || "Product")}</b><small>Qty: ${Number(item.quantity) || 1}${item.size ? ` · Size: ${esc(item.size)}` : ""}${item.color ? ` · Colour: ${esc(item.color)}` : ""}</small></div><strong>${money((Number(item.product_price) || 0) * (Number(item.quantity) || 1))}</strong></div>`).join("")}</div>`
      : `<div class="orderProducts"><h4>Items in this order</h4><p class="muted">${itemsError ? "Order items are temporarily unavailable." : "No item details were saved for this order."}</p></div>`;
    html += `<article class="orderCard" data-customer-order="${esc(o.id)}"><div class="orderCardTop"><div><span class="muted">ORDER NUMBER</span><b class="orderNumber">${esc(o.id.slice(0, 8).toUpperCase())}</b><small class="orderPlacedDate">${o.created_at ? new Date(o.created_at).toLocaleString() : ""}</small></div><span class="orderCurrentBadge">${esc(stage.label)}</span></div><div class="orderMetaGrid"><div><small>Order total</small><b>${money(o.total)}</b></div><div><small>Payment status</small><b class="paymentStatusText">${esc(o.payment_status || "Pending")}</b></div></div>${itemList}${renderOrderTimeline(stage)}<div class="orderInfo"><p><b>Tracking number:</b> ${esc(o.tracking_number || "Not assigned yet")}</p><p><b>Delivery address:</b> ${esc(o.delivery_address || "Not available")}</p></div>${pickup ? `<div class="pickupNotice"><b>📦 Your item may be ready for collection.</b><p>${esc(latest?.message || "Please check the latest shipment details before travelling to collect it.")}</p></div>` : ""}<div class="shipmentHistory"><h4>Shipment updates</h4>${updates.map((u) => `<div class="shipmentUpdateRow"><span class="shipmentUpdatePin">📍</span><div><b>${esc(u.status || "Update")}</b><p>${esc(u.message || "")}</p><small>${u.created_at ? new Date(u.created_at).toLocaleString() : ""}</small></div></div>`).join("") || `<p class="muted">${updatesError ? "Shipment updates are temporarily unavailable." : "No shipment updates yet. We’ll show new updates here as the store processes your order."}</p>`}</div><div class="orderActionRow"><button type="button" class="secondary" data-order-receipt="${esc(o.id)}">Download / Print receipt</button><button type="button" class="primary" data-order-reorder="${esc(o.id)}">Reorder items</button></div></article>`;
  }
  list.innerHTML = html;
  applyOrderFilter("ongoing");
}
function printCustomerOrderReceipt(orderId) {
  const order = customerOrdersCache.find(row => String(row.id) === String(orderId));
  if (!order) return alert("Order details could not be found. Please refresh My Orders.");
  const items = customerOrderItemsCache[orderId] || [];
  const itemRows = items.map(item => `<tr><td>${esc(item.product_name || "Product")}${item.size ? `<br>Size: ${esc(item.size)}` : ""}${item.color ? `<br>Colour: ${esc(item.color)}` : ""}</td><td>${Number(item.quantity) || 1}</td><td>${money(item.product_price)}</td><td>${money((Number(item.product_price) || 0) * (Number(item.quantity) || 1))}</td></tr>`).join("");
  const popup = window.open("", "_blank", "width=720,height=850");
  if (!popup) return alert("Please allow pop-ups for this website to print your receipt.");
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BIG ALIEN Receipt</title><style>body{font:15px Arial,sans-serif;color:#172033;margin:32px}header{border-bottom:3px solid #075bea;padding-bottom:14px}h1{color:#075bea;margin:0}small{color:#64748b}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:22px 0}.meta div{background:#f1f5fb;padding:12px;border-radius:8px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:11px 7px;border-bottom:1px solid #dbe3ef}th{background:#f1f5fb}.total{text-align:right;font-size:20px;font-weight:bold;margin-top:22px}.foot{margin-top:35px;color:#64748b}@media print{button{display:none}body{margin:15mm}}</style></head><body><header><h1>BIG ALIEN</h1><b>Big Alien Venture 👽</b><p>Order receipt</p></header><div class="meta"><div><small>ORDER NUMBER</small><br><b>${esc(order.id.slice(0,8).toUpperCase())}</b></div><div><small>ORDER DATE</small><br><b>${order.created_at ? new Date(order.created_at).toLocaleString() : "—"}</b></div><div><small>PAYMENT STATUS</small><br><b>${esc(order.payment_status || "Pending")}</b></div><div><small>ORDER STATUS</small><br><b>${esc(order.order_status || "Processing")}</b></div></div><p><b>Customer:</b> ${esc(order.customer_name || "")}</p><p><b>Delivery address:</b> ${esc(order.delivery_address || "")}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${itemRows || "<tr><td colspan='4'>No saved item details</td></tr>"}</tbody></table><div class="total">Order total: ${money(order.total)}</div><p class="foot">Thank you for shopping with BIG ALIEN. Keep this receipt for your records.</p><script>window.onload=()=>window.print();<\/script></body></html>`);
  popup.document.close();
}

async function reorderCustomerOrder(orderId) {
  const items = customerOrderItemsCache[orderId] || [];
  if (!items.length) return alert("The saved products for this order are unavailable, so it cannot be reordered from this record.");
  let added = 0, unavailable = [];
  for (const oldItem of items) {
    const product = products.find(p => String(p.id) === String(oldItem.product_id));
    if (!product || product.active === false || productStock(product) < 1) {
      unavailable.push(oldItem.product_name || "A product");
      continue;
    }
    const quantity = Math.max(1, Number(oldItem.quantity) || 1);
    const available = productStock(product);
    if (quantity > available) {
      unavailable.push(`${oldItem.product_name || product.name} (only ${available} available)`);
      continue;
    }
    addCart(product, quantity, { size: oldItem.size || "", color: oldItem.color || "" });
    added++;
  }
  if (added) {
    show("cartView");
    renderCart();
    if (unavailable.length) alert(`Some items were not added: ${unavailable.join(", ")}.`);
  } else {
    alert(`No items could be reordered. ${unavailable.join(", ")}`);
  }
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
async function loadAdminAnalytics() {
  const box = $("adminAnalytics");
  if (!box) return;
  box.innerHTML = `<div class="summary">Loading sales analytics…</div>`;
  const { data: orders, error } = await sb
    .from("orders")
    .select("id,total,payment_status,order_status,created_at")
    .order("created_at", { ascending: false });
  if (error) {
    box.innerHTML = `<div class="summary">Could not load sales analytics: ${esc(error.message)}</div>`;
    return;
  }
  const rows = orders || [];
  const norm = value => String(value || "").trim().toLowerCase();
  const paid = rows.filter(o => ["paid", "success", "successful", "completed"].includes(norm(o.payment_status)));
  const failed = rows.filter(o => ["failed", "declined", "cancelled", "canceled"].includes(norm(o.payment_status)));
  const pending = rows.filter(o => ["pending", "processing", "awaiting payment", "awaiting_payment"].includes(norm(o.payment_status)) || ["pending", "processing"].includes(norm(o.order_status)));
  const revenue = paid.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const paidOrderIds = paid.map(o => o.id);
  let bestSellers = [];
  let itemNotice = "";
  if (paidOrderIds.length) {
    const { data: items, error: itemError } = await sb
      .from("order_items")
      .select("order_id,product_name,quantity,product_price")
      .in("order_id", paidOrderIds);
    if (itemError) {
      itemNotice = `<p class="muted">Best-selling products are unavailable because order items could not be read: ${esc(itemError.message)}</p>`;
    } else {
      const totals = new Map();
      (items || []).forEach(item => {
        const name = item.product_name || "Product";
        const current = totals.get(name) || { name, quantity: 0, revenue: 0 };
        const quantity = Number(item.quantity) || 0;
        current.quantity += quantity;
        current.revenue += quantity * (Number(item.product_price) || 0);
        totals.set(name, current);
      });
      bestSellers = [...totals.values()].sort((a,b) => b.quantity-a.quantity).slice(0,5);
    }
  }
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(dayStart); weekStart.setDate(weekStart.getDate()-6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sumSince = start => paid.filter(o => o.created_at && new Date(o.created_at) >= start).reduce((sum,o) => sum + (Number(o.total)||0),0);
  const stats = [
    ["Total revenue", money(revenue), "success"],
    ["Total orders", rows.length.toLocaleString("en-NG"), "info"],
    ["Pending orders", pending.length.toLocaleString("en-NG"), "warning"],
    ["Failed payments", failed.length.toLocaleString("en-NG"), "danger"]
  ];
  box.innerHTML = `
    <div class="analyticsGrid">${stats.map(([label,value,tone]) => `<article class="analyticsStat ${tone}"><span>${label}</span><strong>${value}</strong></article>`).join("")}</div>
    <section class="analyticsPanel"><h3>Revenue overview</h3><div class="analyticsRevenueRows">
      <div><span>Today</span><b>${money(sumSince(dayStart))}</b></div>
      <div><span>Last 7 days</span><b>${money(sumSince(weekStart))}</b></div>
      <div><span>This month</span><b>${money(sumSince(monthStart))}</b></div>
      <div><span>All time (paid orders)</span><b>${money(revenue)}</b></div>
    </div><p class="muted">Revenue is calculated from orders whose payment status is marked paid/successful/completed.</p></section>
    <section class="analyticsPanel"><h3>Best-selling products</h3>
      ${bestSellers.length ? `<div class="analyticsBestList">${bestSellers.map((item,i)=>`<div><span class="analyticsRank">${i+1}</span><b>${esc(item.name)}</b><span>${item.quantity} sold</span><strong>${money(item.revenue)}</strong></div>`).join("")}</div>` : `<p class="muted">No paid order item data is available yet.</p>`}
      ${itemNotice}
    </section>
    <p class="muted analyticsFootnote">Figures are based on the orders currently accessible to your admin account. Use Refresh Analytics after new orders or payment updates.</p>`;
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
               ${item.size ? `<p>Size: ${esc(item.size)}</p>` : ""}
               ${item.color ? `<p>Color: ${esc(item.color)}</p>` : ""}
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
        <p><b>Order contact email:</b> ${esc((o.notes || "").match(/Contact email for this order:\s*([\s\S]*?)\. Customer reported payment/i)?.[1] || "Not saved on this order")}</p>
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
  $("productDepartment").value = p?.department || "general";
  $("productCategory").value = p?.category || "Solar";
  $("productPrice").value = p?.price || "";
  $("productStock").value = p?.stock ?? 0;
  $("productDescription").value = p?.description || "";
  $("productSizes").value = Array.isArray(p?.sizes) ? p.sizes.join(", ") : "";
  $("productColors").value = Array.isArray(p?.colors) ? p.colors.join(", ") : "";
  const previews = p ? productImages(p).filter(u => u && !String(u).includes("logo.png")) : [];
  $("imagePreview").innerHTML = previews.map(url => `<img class="preview" style="max-width:90px;margin:4px" src="${esc(url)}">`).join("");
  $("productImage").value = "";
  $("productMsg").textContent = "";
  $("productModal").classList.remove("hidden");
}
async function saveProduct(e) {
  e.preventDefault();
  const id = $("productId").value;
  const files = Array.from($("productImage").files || []);
  const existing = productById(id);
  let imageUrls = Array.isArray(existing?.images) ? [...existing.images] : (existing?.image_url ? [existing.image_url] : []);
  if (files.length) {
    imageUrls = [];
    for (const file of files) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: up } = await sb.storage.from("product-images").upload(path, file, {upsert:false, contentType:file.type});
      if (up) return msg("productMsg", up.message);
      imageUrls.push(sb.storage.from("product-images").getPublicUrl(path).data.publicUrl);
    }
  }
  const parseList = value => [...new Set(String(value || "").split(",").map(x => x.trim()).filter(Boolean))];
  const payload = {
    name: $("productName").value.trim(),
    department: $("productDepartment").value,
    category: $("productCategory").value,
    price: Number($("productPrice").value),
    stock: Number($("productStock").value),
    description: $("productDescription").value.trim(),
    sizes: parseList($("productSizes").value),
    colors: parseList($("productColors").value)
  };
  if (imageUrls.length) { payload.images = imageUrls; payload.image_url = imageUrls[0]; }
  const res = id ? await sb.from("products").update(payload).eq("id", id) : await sb.from("products").insert(payload);
  if (res.error) return msg("productMsg", res.error.message + " If it mentions sizes, colors or images, run the supplied Supabase SQL setup first.");
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
  $("orderModalBody").innerHTML = `<h2>Manage Order ${id.slice( 0, 8 )}</h2><p>${esc(o.customer_name)} · ${esc(o.customer_phone)}</p><p><b>Order contact email:</b> ${esc((o.notes || "").match(/Contact email for this order:\s*([\s\S]*?)\. Customer reported payment/i)?.[1] || "Not saved on this order")}</p><p>${esc( o.delivery_address )}</p><label>Payment status<select id="mPay"><option ${ o.payment_status === "pending" ? "selected" : "" }>pending</option><option ${ o.payment_status === "paid" ? "selected" : "" }>paid</option><option ${ o.payment_status === "failed" ? "selected" : "" }>failed</option><option ${ o.payment_status === "refunded" ? "selected" : "" }>refunded</option></select></label><label>Shipment status<select id="mStatus">${[ "processing", "confirmed", "shipped", "out_for_delivery", "ready_for_collection", "delivered", "cancelled", "returned", ] .map( (s) => `<option ${o.order_status === s ? "selected" : ""}>${s}</option>` ) .join( "" )}</select></label><label>Tracking number<input id="mTrack" value="${esc( o.tracking_number || "" )}"></label><label>Shipment message<textarea id="mMessage" placeholder="e.g. Package has left Abuja sorting centre"></textarea></label><label>Location<input id="mLocation" placeholder="e.g. Abuja"></label><button class="primary" id="saveOrder">Save Update</button><h3>History</h3>${( ups || [] ) .map( (u) => `<div>📍 <b>${esc(u.status)}</b> — ${esc(u.message)} (${new Date( u.created_at ).toLocaleString()})</div>` ) .join("")}`;
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
// Keep the current section and scroll position when the browser is backgrounded.
window.addEventListener("pagehide", () => {
  try {
    if (currentView && !["authView", "otpView"].includes(currentView)) {
      sessionStorage.setItem("bav_last_view", currentView);
      sessionStorage.setItem("bav_last_scroll", String(window.scrollY || 0));
    }
  } catch (_) {}
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    try {
      if (currentView && !["authView", "otpView"].includes(currentView)) {
        sessionStorage.setItem("bav_last_view", currentView);
        sessionStorage.setItem("bav_last_scroll", String(window.scrollY || 0));
      }
    } catch (_) {}
  }
});

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
    let savedView = "homeView";
    let savedScroll = 0;
    try {
      const allowedViews = [
        "homeView", "cartView", "checkoutView", "ordersView", "wishlistView",
        "profileView", "customerInboxView", "accountManagementView",
        "personalDetailsView", "deliveryAddressView", "emailSettingsView",
        "passwordSettingsView", "reviewsView", "rewardsView", "supportView",
        "deleteAccountView"
      ];
      const candidate = sessionStorage.getItem("bav_last_view");
      if (allowedViews.includes(candidate)) savedView = candidate;
      savedScroll = Math.max(0, Number(sessionStorage.getItem("bav_last_scroll") || 0));
    } catch (_) {}
    show(savedView, false);
    await loadProducts();

    // Rebuild data-backed screens after restoring their visibility.
    if (savedView === "cartView") renderCart();
    if (savedView === "wishlistView") renderWishlist();
    if (savedView === "profileView" || savedView === "accountManagementView") await loadProfile();
    if (savedView === "ordersView") await openOrders();
    if (savedView === "rewardsView") await loadCustomerRewards();
    if (savedView !== "checkoutView") {
      requestAnimationFrame(() => window.scrollTo({ top: savedScroll, behavior: "auto" }));
    }
  } else {
    try {
      sessionStorage.removeItem("bav_last_view");
      sessionStorage.removeItem("bav_last_scroll");
    } catch (_) {}
    show("authView");
  }
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
      // Email-change OTP verification can emit SIGNED_IN. Keep the customer
      // on the Email Address screen; only their own Home action should leave it.
      const emailSettingsScreen = $("emailSettingsView");
      if (event === "SIGNED_IN" && emailSettingsScreen && !emailSettingsScreen.classList.contains("hidden")) {
        return;
      }
      show("homeView");
      await loadProducts();
    }
  });
  // Paystack redirects back to the store with a transaction reference.
  await handlePaystackReturn();
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

// BIG ALIEN AI customer support chat. The AI key stays inside the Supabase Edge Function.
const aiChatHistory = [];
let aiChatBusy = false;

function addAiChatBubble(message, who = "bot", extraClass = "") {
  const area = $("aiChatMessages");
  if (!area) return null;
  const bubble = document.createElement("div");
  bubble.className = `aiChatBubble ${who === "user" ? "aiUserBubble" : "aiBotBubble"} ${extraClass}`.trim();
  bubble.textContent = message;
  area.appendChild(bubble);
  area.scrollTop = area.scrollHeight;
  return bubble;
}

async function sendAiSupportMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  if (!message || aiChatBusy) return;
  if (!sb || !user) {
    addAiChatBubble("Please sign in to use BIG ALIEN AI Support. You can also contact us on WhatsApp.");
    return;
  }
  if (/password|card pin|\\bpin\\b|\\botp\\b|one.?time.?password/i.test(message)) {
    addAiChatBubble("For your security, please don't send passwords, card PINs or OTP codes here. I can still help with general shopping questions.");
    return;
  }

  addAiChatBubble(message, "user");
  aiChatHistory.push({ role: "user", content: message });
  const input = $("aiChatInput");
  const send = $("aiChatSend");
  const typing = addAiChatBubble("AI assistant is typing…", "bot", "aiTyping");
  aiChatBusy = true;
  if (input) input.disabled = true;
  if (send) { send.disabled = true; send.textContent = "…"; }

  try {
    const productContext = (products || []).filter(p => p.active !== false).slice(0, 80).map(p => ({
      name: p.name, category: p.category, price: Number(p.price) || 0,
      availability: productStock(p) > 0 ? "In Stock" : "Out of Stock",
      description: String(p.description || "").slice(0, 240)
    }));
    const { data, error } = await sb.functions.invoke("ai-customer-support", {
      body: {
        messages: aiChatHistory.slice(-12),
        store_context: {
          store_name: "BIG ALIEN VENTURE",
          currency: "NGN",
          support_phone: "07025136166",
          whatsapp: "https://wa.me/2347025136166",
          products: productContext
        }
      }
    });
    if (error) throw error;
    const answer = String(data?.reply || "").trim();
    if (!answer) throw new Error("The AI assistant returned an empty reply.");
    typing?.remove();
    addAiChatBubble(answer);
    aiChatHistory.push({ role: "assistant", content: answer });
    if (aiChatHistory.length > 16) aiChatHistory.splice(0, aiChatHistory.length - 16);
  } catch (error) {
    console.error("BIG ALIEN AI support error:", error);
    typing?.remove();
    addAiChatBubble("I'm having trouble connecting right now. Please try again shortly or contact our team directly on WhatsApp.");
  } finally {
    aiChatBusy = false;
    if (input) { input.disabled = false; input.value = ""; input.focus(); }
    if (send) { send.disabled = false; send.textContent = "Send ➤"; }
  }
}

const aiChatForm = $("aiChatForm");
if (aiChatForm) aiChatForm.addEventListener("submit", event => {
  event.preventDefault();
  sendAiSupportMessage($("aiChatInput")?.value || "");
});
document.querySelectorAll("[data-ai-prompt]").forEach(button => {
  button.addEventListener("click", () => sendAiSupportMessage(button.dataset.aiPrompt || ""));
});

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
      if (action === "rewards") {
        show("rewardsView");
        loadCustomerRewards();
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
          : action === "delete"
          ? "deleteAccountView"
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
  if (t.id === "refreshRewardsBtn") {
    e.preventDefault();
    await loadCustomerRewards();
    return;
  }
  if (t.dataset.orderReceipt) {
    e.preventDefault();
    printCustomerOrderReceipt(t.dataset.orderReceipt);
    return;
  }
  if (t.dataset.orderReorder) {
    e.preventDefault();
    await reorderCustomerOrder(t.dataset.orderReorder);
    return;
  }
  if (t.dataset.discoveryOpen) {
    e.preventDefault();
    openDiscoveryPage(t.dataset.discoveryOpen);
    return;
  }
  if (t.id === "discoveryBackBtn") {
    e.preventDefault();
    show("homeView");
    renderProducts();
    return;
  }
  if (t.dataset.discoveryAdd) {
    e.preventDefault();
    const product = productById(t.dataset.discoveryAdd);
    if (!product || productStock(product) < 1) {
      wishlistToast("This product is currently out of stock.", false);
      return;
    }
    addCart(product, 1);
    wishlistToast(`${product.name} added to your cart.`);
    return;
  }
  if (t.dataset.view === "home") {
    e.preventDefault();
    show("homeView");
    renderProducts();
  }
  if (t.dataset.department) {
    const dept = t.dataset.department;
    category = "All"; query = "";
    if (dept === "chicken" || dept === "solar") {
      departmentCategory[dept] = "All";
      show(dept === "chicken" ? "chickenShopView" : "solarShopView");
      renderDepartmentShop(dept);
    } else {
      selectedDepartment = "general";
      renderCats(); renderProducts();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (t.hasAttribute("data-back-departments")) {
    selectedDepartment = "all"; category = "All"; query = "";
    show("homeView"); renderCats(); renderProducts();
    window.scrollTo({top:0,behavior:"smooth"}); return;
  }
  if (t.dataset.shopCat) {
    const dept = t.dataset.shopDept;
    departmentCategory[dept] = t.dataset.shopCat;
    renderDepartmentShop(dept); return;
  }
  if (t.id === "allDepartmentsBtn") {
    selectedDepartment = "all";
    category = "All";
    query = "";
    if ($("search")) $("search").value = "";
    renderCats();
    renderProducts();
    return;
  }
  if (t.dataset.cat) {
    category = t.dataset.cat;
    renderCats();
    renderProducts();
  }
  if (t.dataset.product) openProduct(t.dataset.product);
  if (t.dataset.productImage !== undefined) {
    const index = Number(t.dataset.productImage);
    const main = $("productMainImage");
    if (main && activeProductImages[index]) {
      main.src = activeProductImages[index];
      document.querySelectorAll(".productThumb").forEach((thumb, i) => {
        thumb.classList.toggle("active", i === index);
        thumb.setAttribute("aria-pressed", i === index ? "true" : "false");
      });
    }
  }
  if (t.dataset.wishlistRemove) {
    toggleWishlist(t.dataset.wishlistRemove);
    return;
  }
  if (t.dataset.wishlistAdd || t.dataset.wishlistToggle) {
    toggleWishlist(t.dataset.wishlistAdd || t.dataset.wishlistToggle);
    if (currentView === "productView") {
      const product = productById(t.dataset.wishlistAdd || t.dataset.wishlistToggle);
      if (product) openProduct(product.id);
    }
    return;
  }
  if (t.dataset.wishlistCart) {
    const product = productById(t.dataset.wishlistCart);
    if (!product || productStock(product) < 1) {
      wishlistToast("This product is currently out of stock.", false);
      return;
    }
    addCart(product, 1);
    wishlistToast(`${product.name} added to your cart.`);
    return;
  }
  if (t.hasAttribute("data-wishlist-shop")) {
    show("homeView");
    renderProducts();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
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
    let x = cart.find((x) => String(x.id) === String(t.dataset.minus) && (x.size || "") === (t.dataset.size || "") && (x.color || "") === (t.dataset.color || ""));
    if (x) {
      x.qty = Math.max(1, x.qty - 1);
      saveCart();
      renderCart();
    }
  }
  if (t.dataset.plus) {
    const item = cart.find((row) => String(row.id) === String(t.dataset.plus) && (row.size || "") === (t.dataset.size || "") && (row.color || "") === (t.dataset.color || ""));
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
    cart = cart.filter((x) => !(String(x.id) === String(t.dataset.remove) && (x.size || "") === (t.dataset.size || "") && (x.color || "") === (t.dataset.color || "")));
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
    ["products", "orders", "analytics"].forEach(tab => {
      const panel = $("admin" + tab.charAt(0).toUpperCase() + tab.slice(1) + "Tab");
      if (panel) panel.classList.toggle("hidden", t.dataset.adminTab !== tab);
    });
    document.querySelectorAll("[data-admin-tab]").forEach(x =>
      x.classList.toggle("active", x.dataset.adminTab === t.dataset.adminTab)
    );
    if (t.dataset.adminTab === "analytics") loadAdminAnalytics();
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
const savedAddressForm = $("savedAddressForm");
if (savedAddressForm) savedAddressForm.onsubmit = (e) => {
  e.preventDefault();
  if (!user) return msg("addressMsg", "Please sign in again.");
  const value = $("savedAddress").value.trim();
  if (!value) return msg("addressMsg", "Please enter your full delivery address.");
  localStorage.setItem(`big_alien_address_${user.id}`, value);
  if ($("accountAddressSummary")) $("accountAddressSummary").textContent = value;
  if ($("coAddress")) $("coAddress").value = value;
  msg("addressMsg", "Delivery address saved for future orders.", true);
};
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

const profilePhotoInput = $("profilePhotoInput");
if (profilePhotoInput) profilePhotoInput.addEventListener("change", () => {
  const file = profilePhotoInput.files && profilePhotoInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { alert("Please choose an image file."); profilePhotoInput.value = ""; return; }
  if (file.size > 2 * 1024 * 1024) { alert("Please choose a photo smaller than 2 MB."); profilePhotoInput.value = ""; return; }
  const reader = new FileReader();
  reader.onload = () => {
    if (!user || typeof reader.result !== "string") return;
    try {
      localStorage.setItem(`big_alien_profile_photo_${user.id}`, reader.result);
      const paint = (id) => { const el = $(id); if (el) el.innerHTML = `<img src="${reader.result}" alt="Customer profile photo">`; };
      paint("profilePhotoPreview"); paint("accountAvatarPreview");
      msg("profileMsg", "Profile photo updated on this device.", true);
    } catch (err) {
      alert("This photo is too large to save on this device. Please choose a smaller photo.");
    }
  };
  reader.readAsDataURL(file);
});
if ($("removeProfilePhotoBtn")) $("removeProfilePhotoBtn").addEventListener("click", () => {
  if (!user) return;
  localStorage.removeItem(`big_alien_profile_photo_${user.id}`);
  ["profilePhotoPreview", "accountAvatarPreview"].forEach(id => { const el = $(id); if (el) el.textContent = "👤"; });
  if ($("profileMsg")) msg("profileMsg", "Profile photo removed.", true);
});

if ($("adminNotificationsBtn"))
  $("adminNotificationsBtn").onclick = async () => {
    const panel = $("adminNotificationsPanel");
    panel.classList.toggle("hidden");
    await loadAdminNotifications();
  };
if ($("refreshAdminNotifications"))
  $("refreshAdminNotifications").onclick = loadAdminNotifications;
if ($("refreshAdminAnalytics")) $("refreshAdminAnalytics").onclick = loadAdminAnalytics;
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
  const emailForm = $("changeEmailForm");
  if (emailForm && $("emailFormSlot")) $("emailFormSlot").append(emailForm);
  const passwordForm = $("changePasswordForm");
  if (passwordForm && $("passwordFormSlot")) $("passwordFormSlot").append(passwordForm);
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
$("productImage")?.addEventListener("change", () => {
  const files = Array.from($("productImage").files || []);
  $("imagePreview").innerHTML = files.map(file => {
    const url = URL.createObjectURL(file);
    return `<img class="preview" style="max-width:90px;margin:4px" src="${url}" alt="${esc(file.name)}">`;
  }).join("");
});
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


// Secure customer account deletion. The Edge Function rechecks role and orders server-side.
const confirmDeleteAccountBtn = $("confirmDeleteAccountBtn");
if (confirmDeleteAccountBtn) {
  confirmDeleteAccountBtn.addEventListener("click", async () => {
    const status = $("deleteAccountMsg");
    const confirmation = $("deleteAccountConfirmText")?.value.trim() || "";
    const setStatus = (message, ok = false) => {
      if (status) { status.textContent = message; status.style.color = ok ? "#147a32" : "#b00020"; }
    };
    if (!sb) return setStatus("Account service is unavailable. Please refresh and try again.");
    if (confirmation !== "DELETE") return setStatus("Type DELETE exactly to confirm.");
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError || !sessionData?.session) return setStatus("Your session has expired. Please sign in again.");
    const ok = window.confirm("Are you absolutely sure? Your customer account will be permanently deleted. Completed order records will be anonymised and retained.");
    if (!ok) return;
    confirmDeleteAccountBtn.disabled = true;
    confirmDeleteAccountBtn.textContent = "Checking orders and deleting…";
    setStatus("Checking your account and order status…");
    try {
      const { data, error } = await sb.functions.invoke("delete-customer-account", { body: { confirmation: "DELETE" } });
      if (error) {
        let detail = error.message || "The deletion request failed.";
        try { const body = await error.context?.json?.(); if (body?.error) detail = body.error; } catch (_) {}
        setStatus(detail);
        return;
      }
      if (!data?.success) { setStatus(data?.error || "The account could not be deleted."); return; }
      const oldUserId = user?.id;
      if (oldUserId) {
        localStorage.removeItem(`big_alien_profile_photo_${oldUserId}`);
        localStorage.removeItem(`big_alien_address_${oldUserId}`);
        localStorage.removeItem(`big_alien_wishlist_${oldUserId}`);
      }
      localStorage.removeItem("big_alien_cart");
      await sb.auth.signOut();
      user = null; profile = null; cart = [];
      show("authView");
      msg("authMsg", "Your customer account has been deleted successfully.", true);
    } catch (error) {
      setStatus("Deletion failed: " + (error?.message || String(error)));
    } finally {
      confirmDeleteAccountBtn.disabled = false;
      confirmDeleteAccountBtn.textContent = "Permanently Delete My Account";
    }
  });
}

// Make the discovery section arrows respond directly on mobile as well as desktop.
// Stop propagation so the document-level delegated handler does not open the page twice.
document.querySelectorAll("[data-discovery-open]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDiscoveryPage(button.dataset.discoveryOpen);
  });
});
