
const cfg=window.BIG_ALIEN_CONFIG||{};
const ready=cfg.SUPABASE_URL&&!cfg.SUPABASE_URL.includes('PASTE_')&&cfg.SUPABASE_PUBLISHABLE_KEY&&!cfg.SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const sb=ready?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY):null;
let adminUser=null;

const $=id=>document.getElementById(id);
const money=n=>'₦'+Number(n||0).toLocaleString('en-NG',{maximumFractionDigits:0});
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const img=u=>u||'images/logo.png';

function showDenied(){
  $('checking').classList.add('hidden');
  $('adminApp').classList.add('hidden');
  $('adminLogin')?.classList.add('hidden');
  $('denied').classList.remove('hidden');
}

async function check(){
  if(!sb)return showDenied();
  const {data:{session}}=await sb.auth.getSession();
  if(!session){ $('checking').classList.add('hidden'); $('denied').classList.add('hidden'); $('adminLogin')?.classList.remove('hidden'); return; }

  adminUser=session.user;
  const {data:p}=await sb.from('profiles').select('role').eq('id',session.user.id).single();
  if(p?.role!=='admin'){ await sb.auth.signOut(); $('checking').classList.add('hidden'); $('adminApp').classList.add('hidden'); $('denied').classList.add('hidden'); $('adminLogin')?.classList.remove('hidden'); if($('adminLoginMsg'))$('adminLoginMsg').textContent='This account does not have the admin role.'; return; }

  $('checking').classList.add('hidden');
  $('adminLogin')?.classList.add('hidden');
  $('denied').classList.add('hidden');
  $('adminApp').classList.remove('hidden');
  await loadProducts();
  await loadOrders();
  await loadNotifications();
}

async function loadNotifications(){
  const box=$('adminMessages');
  if(!box||!sb||!adminUser)return;

  const {data,error}=await sb.from('notifications')
    .select('id,title,message,type,order_id,read_at,created_at')
    .eq('recipient_user_id',adminUser.id)
    .order('created_at',{ascending:false})
    .limit(50);

  if(error){
    box.innerHTML='<p class="notificationEmpty">Could not load notifications: '+esc(error.message)+'</p>';
    return;
  }

  const rows=data||[];
  $('adminUnreadCount').textContent=String(rows.filter(n=>!n.read_at).length);

  if(!rows.length){
    box.innerHTML='<p class="notificationEmpty">No admin notifications yet. New orders and customer payment reports will appear here.</p>';
    return;
  }

  box.innerHTML=`
    <div class="adminNotificationActions">
      <button class="secondary" type="button" data-clear-all-admin-notifications>
        Clear All Notifications
      </button>
    </div>
    ${rows.map(n=>`
      <article class="notificationItem ${n.read_at?'':'unread'}">
        <span aria-hidden="true">${n.type==='new_order'?'🛍️':n.type==='payment_reported'?'💳':'🔔'}</span>
        <div class="notificationText">
          <b>${esc(n.title)}</b>
          <p>${esc(n.message)}</p>
          <small>${new Date(n.created_at).toLocaleString()}</small>
        </div>
        ${n.order_id?`<button class="secondary" type="button" data-order="${esc(n.order_id)}">Open order</button>`:''}
        ${!n.read_at?`<button class="secondary" type="button" data-read-notification="${esc(n.id)}">Mark read</button>`:''}
        <button class="secondary" type="button" data-clear-admin-notification="${esc(n.id)}">Clear</button>
      </article>
    `).join('')}`;

  box.querySelectorAll('[data-clear-admin-notification]').forEach(button => {
  button.onclick = () => clearAdminNotification(button.dataset.clearAdminNotification);
});

const clearAll = box.querySelector('[data-clear-all-admin-notifications]');
if (clearAll) clearAll.onclick = clearAllAdminNotifications;
}

async function clearAdminNotification(id){
  if(!confirm('Clear this notification only? The order and delivery history will remain.'))return;

  const {error}=await sb.from('notifications').delete()
    .eq('id',id)
    .eq('recipient_user_id',adminUser.id);

  if(error){
    alert('Could not clear notification: '+error.message);
    return;
  }
  await loadNotifications();
}

async function clearAllAdminNotifications(){
  if(!confirm('Clear all notifications for your admin account? Orders and delivery history will remain.'))return;

  const {error}=await sb.from('notifications').delete()
    .eq('recipient_user_id',adminUser.id);

  if(error){
    alert('Could not clear notifications: '+error.message);
    return;
  }
  await loadNotifications();
}

async function markNotificationRead(id){
  const {error}=await sb.from('notifications').update({read_at:new Date().toISOString()})
    .eq('id',id)
    .eq('recipient_user_id',adminUser.id);

  if(error)return alert(error.message);
  await loadNotifications();
}

async function loadProducts(){
  const {data,error}=await sb.from('products').select('*').order('created_at',{ascending:false});

  if(error){
    $('adminProducts').innerHTML='<div class="summary">'+esc(error.message)+'</div>';
    return;
  }

  const rows=(data||[]).map(p=>`
    <div class="adminRow">
      <img src="${esc(img(p.image_url))}" alt="">
      <div><b>${esc(p.name)}</b><div class="muted">${esc(p.category)}</div></div>
      <div>${money(p.price)}</div>
      <div>${p.stock}</div>
      <div>${p.active?'Live':'Hidden'}</div>
      <div><button class="secondary" data-edit="${p.id}">Edit</button> <button class="danger" data-delete="${p.id}">Delete</button></div>
    </div>`).join('');

  $('adminProducts').innerHTML=`<div class="adminTable">
    <div class="adminRow"><b>Image</b><b>Product</b><b>Price</b><b>Stock</b><b>Status</b><b>Actions</b></div>
    ${rows||'<div class="summary">No products yet.</div>'}
  </div>`;
}

async function loadOrders(){
  const {data,error}=await sb.from('orders').select('*').order('created_at',{ascending:false});

  if(error){
    $('adminOrders').innerHTML='<div class="summary">'+esc(error.message)+'</div>';
    return;
  }

  $('adminOrders').innerHTML=(data||[]).map(o=>`
    <div class="orderCard">
      <b>Order ${o.id.slice(0,8)}</b>
      <p>${esc(o.customer_name)} · ${esc(o.customer_phone)} · ${money(o.total)}</p>
      <p>Payment: <span class="status">${esc(o.payment_status)}</span> · Shipment: <span class="status">${esc(o.order_status)}</span></p>
      <p>Tracking: ${esc(o.tracking_number||'Not assigned')}</p>
      <p>Address: ${esc(o.delivery_address)}</p>
      <button class="primary" data-order="${o.id}">Manage Order & Shipment</button>
    </div>`).join('')||'<div class="summary">No orders yet.</div>';
}

function openProduct(p){
  $('productModalTitle').textContent=p?'Edit Product':'Add Product';
  $('productId').value=p?.id||'';
  $('productName').value=p?.name||'';
  $('productCategory').value=p?.category||'Solar';
  $('productPrice').value=p?.price??'';
  $('productStock').value=p?.stock??0;
  $('productDescription').value=p?.description||'';
  $('productSizes').value=Array.isArray(p?.sizes)?p.sizes.join(', '):'';
  $('productColors').value=Array.isArray(p?.colors)?p.colors.join(', '):'';
  $('productImage').value='';
  const imgs=Array.isArray(p?.images)?p.images:(p?.image_url?[p.image_url]:[]);
  $('imagePreview').innerHTML=imgs.map(u=>`<img class="preview" style="max-width:90px;margin:4px" src="${esc(u)}">`).join('');
  $('productMsg').textContent='';
  $('productModal').classList.remove('hidden');
}
async function saveProduct(e){
  e.preventDefault();
  const id=$('productId').value, files=Array.from($('productImage').files||[]);
  const {data:old}=id?await sb.from('products').select('image_url,images').eq('id',id).single():{data:null};
  let imageUrls=Array.isArray(old?.images)?[...old.images]:(old?.image_url?[old.image_url]:[]);
  if(files.length){
    imageUrls=[];
    for(const file of files){
      const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
      const path=`${crypto.randomUUID()}.${ext}`;
      const {error}=await sb.storage.from('product-images').upload(path,file,{upsert:false,contentType:file.type});
      if(error){$('productMsg').textContent=error.message;return;}
      imageUrls.push(sb.storage.from('product-images').getPublicUrl(path).data.publicUrl);
    }
  }
  const parseList=value=>[...new Set(String(value||'').split(',').map(x=>x.trim()).filter(Boolean))];
  const payload={
    name:$('productName').value.trim(),
    category:$('productCategory').value.trim(),
    price:Number($('productPrice').value),
    stock:Number($('productStock').value),
    description:$('productDescription').value.trim(),
    sizes:parseList($('productSizes').value),
    colors:parseList($('productColors').value)
  };
  if(imageUrls.length){payload.images=imageUrls;payload.image_url=imageUrls[0];}
  const r=id?await sb.from('products').update(payload).eq('id',id):await sb.from('products').insert(payload);
  if(r.error){$('productMsg').textContent=r.error.message+' If it mentions images, sizes or colors, run the supplied Supabase SQL setup first.';return;}
  $('productModal').classList.add('hidden');
  await loadProducts();
}

async function deleteProduct(id){
  if(!confirm('Delete this product?'))return;
  const {error}=await sb.from('products').delete().eq('id',id);
  if(error)alert(error.message);
  else loadProducts();
}

async function manageOrder(id){
  const {data:o,error}=await sb.from('orders').select('*').eq('id',id).single();
  if(error)return alert(error.message);

  const {data:orderItems}=await sb.from('order_items').select('*').eq('order_id',id);
  const orderedProductsHtml=(orderItems||[]).map(item=>`<div class="summary"><b>${esc(item.product_name||'Product')}</b><p>Quantity: ${Number(item.quantity)||0} · Unit price: ${money(item.product_price)}</p>${item.size?`<p>Size: ${esc(item.size)}</p>`:''}${item.color?`<p>Color: ${esc(item.color)}</p>`:''}</div>`).join('')||'<p class="muted">No order items found.</p>';
  const {data:ups}=await sb.from('shipment_updates').select('*')
    .eq('order_id',id).order('created_at',{ascending:false});

  $('orderModalBody').innerHTML=`
    <h2>Manage Order ${id.slice(0,8)}</h2>
    <p>${esc(o.customer_name)} · ${esc(o.customer_phone)}</p>
    <p>${esc(o.delivery_address)}</p>
    <h3>Ordered products</h3>${orderedProductsHtml}
    <label>Payment status<select id="mPay">
      <option ${o.payment_status==='pending'?'selected':''}>pending</option>
      <option ${o.payment_status==='paid'?'selected':''}>paid</option>
      <option ${o.payment_status==='failed'?'selected':''}>failed</option>
      <option ${o.payment_status==='refunded'?'selected':''}>refunded</option>
    </select></label>
    <label>Shipment status<select id="mStatus">
      ${['processing','confirmed','shipped','out_for_delivery','delivered','cancelled'].map(s=>`<option value="${s}" ${o.order_status===s?'selected':''}>${s}</option>`).join('')}
    </select></label>
    <label>Tracking number<input id="mTrack" value="${esc(o.tracking_number||'')}"></label>
    <label>Shipment update<textarea id="mMessage" placeholder="e.g. Package has left Abuja sorting centre"></textarea></label>
    <label>Location<input id="mLocation" placeholder="e.g. Abuja"></label>
    <button class="primary" id="saveOrder">Save Update</button>
    <h3>Shipment history</h3>
    ${(ups||[]).map(u=>`<div class="summary">📍 <b>${esc(u.status)}</b> — ${esc(u.message)}<br><span class="muted">${esc(u.location||'')} ${new Date(u.created_at).toLocaleString()}</span></div>`).join('')||'<p class="muted">No shipment updates yet.</p>'}`;

  $('saveOrder').onclick=async()=>{
    const {error}=await sb.from('orders').update({
      payment_status:$('mPay').value,
      order_status:$('mStatus').value,
      tracking_number:$('mTrack').value.trim()||null
    }).eq('id',id);

    if(error)return alert(error.message);

    if ($('mMessage').value.trim()) {
  const { error: e } = await sb.from('shipment_updates').insert({
    order_id: id,
    status: $('mStatus').value,
    message: $('mMessage').value.trim(),
    location: $('mLocation').value.trim() || null
  });

  if (e) return alert(e.message);

  const { error: notifyError } = await sb
    .from('notifications')
    .insert({
      recipient_user_id: o.user_id,
      order_id: id,
      title: 'Shipment update',
      message: `Order ${id.slice(0, 8)}: ${$('mMessage').value.trim()}`,
      type: 'shipment_update'
    });

  if (notifyError) return alert(notifyError.message);
    }
    $('orderModal').classList.add('hidden');
    await loadOrders();
    alert('Order updated. The customer will see the new shipment status.');
  };

  $('orderModal').classList.remove('hidden');
}

document.addEventListener('click',async e=>{
  const t=e.target.closest('button')||e.target;

  if(t.dataset.readNotification){
    await markNotificationRead(t.dataset.readNotification);
    return;
  }

  if(t.dataset.tab){
    document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===t));
    $('productsTab').classList.toggle('hidden',t.dataset.tab!=='products');
    $('ordersTab').classList.toggle('hidden',t.dataset.tab!=='orders');
  }

  if(t.id==='addProductBtn')openProduct();

  if(t.dataset.edit){
    const {data}=await sb.from('products').select('*').eq('id',t.dataset.edit).single();
    if(data)openProduct(data);
  }

  if(t.dataset.delete)deleteProduct(t.dataset.delete);
  if(t.dataset.order)manageOrder(t.dataset.order);
  if(t.dataset.close)$(t.dataset.close).classList.add('hidden');
});

if($('adminMessagesBtn'))$('adminMessagesBtn').onclick=async()=>{
  $('adminMessagesPanel').classList.toggle('hidden');
  await loadNotifications();
};

if($('refreshAdminMessages'))$('refreshAdminMessages').onclick=loadNotifications;

$('productImage')?.addEventListener('change',()=>{
  const files=Array.from($('productImage').files||[]);
  $('imagePreview').innerHTML=files.map(file=>`<img class="preview" style="max-width:90px;margin:4px" src="${URL.createObjectURL(file)}" alt="${esc(file.name)}">`).join('');
});
$('productForm').onsubmit=saveProduct;
if($('adminLoginForm')) $('adminLoginForm').onsubmit=async e=>{
  e.preventDefault();
  $('adminLoginMsg').textContent='Signing in…';
  const {error}=await sb.auth.signInWithPassword({email:$('adminLoginEmail').value.trim(),password:$('adminLoginPassword').value});
  if(error){$('adminLoginMsg').textContent=error.message;return;}
  $('adminLoginMsg').textContent='';
  $('checking').classList.remove('hidden');
  $('adminLogin').classList.add('hidden');
  await check();
};
if($('deniedLoginAgain')) $('deniedLoginAgain').onclick=async()=>{
  await sb.auth.signOut();
  $('denied').classList.add('hidden');
  $('adminLogin').classList.remove('hidden');
};
$('adminLogout').onclick=async()=>{await sb.auth.signOut();location.href='./'};
$('backHome').onclick=()=>location.href='./';
$('deniedLogin').onclick=()=>location.href='./';

check();
