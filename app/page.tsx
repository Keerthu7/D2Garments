"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowRight, ArrowUpRight, Bell,
  Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign,
  ClipboardList, Download, FileChartColumn, FileText, LayoutDashboard, Menu,
  Package, Plus, Printer, Search, Settings2, ShoppingBag, Sparkles, Truck,
  Wallet, X,
} from "lucide-react";

type Section = "Overview" | "Inventory" | "Purchases" | "Sales" | "Cash flow" | "Reports";
type Batch = { id: string; purchaseId: string; product: string; category: string; received: string; quantity: number; remaining: number; materialCost: number; manufacturingCost: number; warehouse: string };
type Purchase = { id: string; supplier: string; reference: string; product: string; quantity: number; materialCost: number; manufacturingCost: number; date: string; paid: number };
type Order = { id: string; invoice?: string; customer: string; channel: string; product: string; quantity: number; price: number; taxRate: number; cogs: number; created: string; status: "Draft" | "Confirmed" | "Invoiced" | "Paid"; paid: number };
type Payment = { id: string; date: string; direction: "in" | "out"; party: string; reference: string; method: string; amount: number };
type Store = { purchases: Purchase[]; batches: Batch[]; orders: Order[]; payments: Payment[] };
type Modal = "purchase" | "order" | "supplier-payment" | "customer-payment" | "invoice" | "reset" | null;

const STORE_KEY = "d2-garments-workspace-v2";
const EMPTY_STORE: Store = { purchases: [], batches: [], orders: [], payments: [] };
const navItems: { name: Section; icon: typeof LayoutDashboard }[] = [
  { name: "Overview", icon: LayoutDashboard }, { name: "Inventory", icon: Boxes },
  { name: "Purchases", icon: Package }, { name: "Sales", icon: ShoppingBag },
  { name: "Cash flow", icon: Wallet }, { name: "Reports", icon: FileChartColumn },
];
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().slice(0, 10);
const makeId = (prefix: string) => `${prefix}-${Date.now().toString().slice(-7)}`;
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function Logo() {
  return <div className="brand"><div className="brand-mark"><span/><span/><span/><span/></div><div className="brand-name">d2<span>garments</span><small>OPERATIONS</small></div></div>;
}

function EmptyState({ icon: Icon, title, copy, action, onAction }: { icon: typeof Package; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={23}/></span><strong>{title}</strong><p>{copy}</p>{action && onAction && <button className="button primary" onClick={onAction}><Plus size={16}/>{action}</button>}</div>;
}

export default function Dashboard() {
  const [section, setSection] = useState<Section>("Overview");
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Store>;
        setStore({ purchases: parsed.purchases ?? [], batches: parsed.batches ?? [], orders: parsed.orders ?? [], payments: parsed.payments ?? [] });
      }
    } catch { localStorage.removeItem(STORE_KEY); }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }, [store, ready]);

  const available = store.batches.reduce((sum, batch) => sum + batch.remaining, 0);
  const inventoryValue = store.batches.reduce((sum, batch) => sum + batch.remaining * (batch.materialCost + batch.manufacturingCost), 0);
  const salesTotal = store.orders.filter(order => order.status !== "Draft").reduce((sum, order) => sum + order.quantity * order.price * (1 + order.taxRate / 100), 0);
  const costTotal = store.orders.filter(order => order.status !== "Draft").reduce((sum, order) => sum + order.cogs, 0);
  const paidIn = store.payments.filter(payment => payment.direction === "in").reduce((sum, payment) => sum + payment.amount, 0);
  const paidOut = store.payments.filter(payment => payment.direction === "out").reduce((sum, payment) => sum + payment.amount, 0);
  const supplierDues = store.purchases.reduce((sum, purchase) => sum + purchase.quantity * (purchase.materialCost + purchase.manufacturingCost) - purchase.paid, 0);
  const receivables = store.orders.reduce((sum, order) => sum + (order.status === "Draft" ? 0 : order.quantity * order.price * (1 + order.taxRate / 100) - order.paid), 0);
  const filteredBatches = useMemo(() => store.batches.filter(batch => `${batch.id} ${batch.product} ${batch.category} ${batch.warehouse}`.toLowerCase().includes(query.toLowerCase()) && (!lowOnly || batch.remaining < 20)), [store.batches, query, lowOnly]);
  const filteredOrders = useMemo(() => store.orders.filter(order => `${order.id} ${order.customer} ${order.product} ${order.status}`.toLowerCase().includes(query.toLowerCase())), [store.orders, query]);
  const filteredPurchases = useMemo(() => store.purchases.filter(purchase => `${purchase.id} ${purchase.supplier} ${purchase.product}`.toLowerCase().includes(query.toLowerCase())), [store.purchases, query]);
  const currentOrder = store.orders.find(order => order.id === selectedOrderId);
  const heading = section === "Overview" ? "Business overview" : section;
  const subheading = section === "Overview" ? "Start with a purchase, then move each order through to payment." : section === "Inventory" ? "Every purchase creates its own stock lot. Older lots stay visible as new stock arrives." : section === "Purchases" ? "Record supplier purchases and track the amount paid and still due." : section === "Sales" ? "Create an order from available stock, confirm it, invoice it, and collect payment." : section === "Cash flow" ? "Customer receipts and supplier payments appear here when you record them." : "Review sales value, cost of goods, manufacturing cost, and gross profit.";

  function message(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(current => current === text ? "" : current), 4500);
  }

  function openPurchase() { setSection("Purchases"); setShowModal("purchase"); }
  function openOrder() {
    if (available <= 0) { setSection("Purchases"); message("Receive a purchase into inventory before creating a sales order."); return; }
    setSection("Sales"); setShowModal("order");
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (showModal === "purchase") {
      const quantity = Number(form.get("quantity"));
      const materialCost = Number(form.get("materialCost"));
      const manufacturingCost = Number(form.get("manufacturingCost"));
      const purchaseId = makeId("PUR");
      const product = String(form.get("product")).trim();
      const purchase: Purchase = { id: purchaseId, supplier: String(form.get("supplier")).trim(), reference: String(form.get("reference") || "").trim(), product, quantity, materialCost, manufacturingCost, date: today(), paid: 0 };
      const batch: Batch = { id: makeId("LOT"), purchaseId, product, category: String(form.get("category")), received: today(), quantity, remaining: quantity, materialCost, manufacturingCost, warehouse: String(form.get("warehouse")) };
      setStore(current => ({ ...current, purchases: [purchase, ...current.purchases], batches: [batch, ...current.batches] }));
      setShowModal(null); message(`${quantity} units of ${product} received. Purchase ${purchaseId} is in your supplier ledger.`);
    } else if (showModal === "order") {
      const product = String(form.get("product"));
      const quantity = Number(form.get("quantity"));
      const price = Number(form.get("price"));
      const taxRate = Number(form.get("taxRate")) || 0;
      const order: Order = { id: makeId("ORD"), customer: String(form.get("customer")).trim(), channel: String(form.get("channel")), product, quantity, price, taxRate, cogs: 0, created: today(), status: "Draft", paid: 0 };
      setStore(current => ({ ...current, orders: [order, ...current.orders] }));
      setShowModal(null); message(`${order.id} created as a draft. Review it and confirm to deduct stock.`);
    } else if (showModal === "supplier-payment" || showModal === "customer-payment") {
      const direction = showModal === "customer-payment" ? "in" : "out";
      const amount = Number(form.get("amount"));
      const method = String(form.get("method"));
      const reference = String(form.get("reference") || "").trim();
      const targetId = String(form.get("target"));
      if (direction === "out") {
        const purchase = store.purchases.find(item => item.id === targetId);
        if (!purchase || amount > purchase.quantity * (purchase.materialCost + purchase.manufacturingCost) - purchase.paid) { message("Payment exceeds the supplier balance. Check the amount and try again."); return; }
        const payment: Payment = { id: makeId("PAY"), date: today(), direction, party: purchase.supplier, reference: reference || purchase.id, method, amount };
        setStore(current => ({ ...current, purchases: current.purchases.map(item => item.id === targetId ? { ...item, paid: item.paid + amount } : item), payments: [payment, ...current.payments] }));
        setShowModal(null); message(`${money(amount)} payment recorded for ${purchase.supplier}. The remaining due is updated.`);
      } else {
        const order = store.orders.find(item => item.id === targetId);
        if (!order || amount > order.quantity * order.price * (1 + order.taxRate / 100) - order.paid) { message("Receipt exceeds the customer balance. Check the amount and try again."); return; }
        const payment: Payment = { id: makeId("REC"), date: today(), direction, party: order.customer, reference: reference || order.invoice || order.id, method, amount };
        const newPaid = order.paid + amount;
        setStore(current => ({ ...current, orders: current.orders.map(item => item.id === targetId ? { ...item, paid: newPaid, status: newPaid >= item.quantity * item.price * (1 + item.taxRate / 100) ? "Paid" : item.status } : item), payments: [payment, ...current.payments] }));
        setShowModal(null); message(`${money(amount)} received from ${order.customer}. Cash flow and the order balance are updated.`);
      }
    }
  }

  function confirmOrder(order: Order) {
    const remainingQty = store.batches.filter(batch => batch.product === order.product).reduce((total, batch) => total + batch.remaining, 0);
    if (remainingQty < order.quantity) { message(`Only ${remainingQty} units of ${order.product} remain. Receive more stock or edit this order.`); return; }
    let toAllocate = order.quantity;
    let cogs = 0;
    const batchUpdates = new Map<string, number>();
    for (const batch of [...store.batches].filter(item => item.product === order.product).reverse()) {
      if (!toAllocate) break;
      const take = Math.min(batch.remaining, toAllocate);
      batchUpdates.set(batch.id, take); toAllocate -= take;
      cogs += take * (batch.materialCost + batch.manufacturingCost);
    }
    setStore(current => ({ ...current, batches: current.batches.map(batch => batchUpdates.has(batch.id) ? { ...batch, remaining: batch.remaining - (batchUpdates.get(batch.id) ?? 0) } : batch), orders: current.orders.map(item => item.id === order.id ? { ...item, status: "Confirmed", cogs } : item) }));
    message(`${order.id} confirmed. ${order.quantity} units deducted from the oldest available stock lots.`);
  }

  function invoiceOrder(order: Order) {
    const invoice = `INV-${order.id.replace("ORD-", "")}`;
    setStore(current => ({ ...current, orders: current.orders.map(item => item.id === order.id ? { ...item, invoice, status: "Invoiced" } : item) }));
    setSelectedOrderId(order.id); setShowModal("invoice");
  }

  function resetAll() {
    localStorage.removeItem(STORE_KEY);
    setStore(EMPTY_STORE); setShowModal(null); setSelectedOrderId(""); setSection("Overview");
    message("Workspace cleared. Inventory, purchases, sales, and cash flow are now empty.");
  }

  function exportReport() {
    const rows = [["Type", "Reference", "Party", "Date", "In", "Out"], ...store.payments.map(payment => [payment.direction === "in" ? "Customer receipt" : "Supplier payment", payment.reference, payment.party, payment.date, payment.direction === "in" ? String(payment.amount) : "0", payment.direction === "out" ? String(payment.amount) : "0"])];
    const csv = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); link.download = "d2-garments-cash-flow.csv"; link.click(); URL.revokeObjectURL(link.href);
    message("Cash-flow report exported as a CSV file.");
  }

  function setPage(next: Section) { setSection(next); setMobileNav(false); setQuery(""); }
  function addAction() {
    if (section === "Sales") openOrder();
    else if (section === "Cash flow") {
      if (supplierDues > 0) setShowModal("supplier-payment");
      else if (receivables > 0) setShowModal("customer-payment");
      else message("There are no outstanding supplier balances or customer invoices to pay yet.");
    }
    else openPurchase();
  }

  const orderTotal = (order: Order) => order.quantity * order.price * (1 + order.taxRate / 100);
  const pendingDrafts = store.orders.filter(order => order.status === "Draft").length;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="sidebar-top"><Logo/><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={19}/></button></div>
      <div className="workspace"><div className="workspace-avatar">D2</div><div className="workspace-label"><strong>D2 Garments</strong><span>Workspace</span></div><span className="demo-badge">DEMO</span></div>
      <div className="nav-label">WORKSPACE</div><nav className="nav-list">{navItems.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${section === name ? "active" : ""}`} onClick={() => setPage(name)}><Icon size={19}/><span>{name}</span>{name === "Inventory" && <span className="nav-count">{store.batches.length}</span>}{name === "Sales" && pendingDrafts > 0 && <span className="nav-count attention">{pendingDrafts}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item settings" onClick={() => setShowModal("reset")}><Settings2 size={19}/><span>Reset workspace</span></button><div className="user-card"><div className="user-avatar">D2</div><div className="user-name"><strong>D2 Garments</strong><span>Admin workspace</span></div></div></div>
    </aside>
    {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={15}/><strong>{section}</strong></div></div><div className="topbar-actions"><div className="global-search"><Search size={18}/><input aria-label="Search this section" placeholder={`Search ${section.toLowerCase()}…`} value={query} onChange={event => setQuery(event.target.value)}/></div><span className="top-divider"/><div className="header-avatar" title="D2 Garments">D2</div></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase()}</div><h1>{heading}</h1><p>{subheading}</p></div><div className="heading-actions"><button className="button secondary" onClick={exportReport}><Download size={17}/> Export cash flow</button><button className="button primary" onClick={addAction}><Plus size={18}/>{section === "Sales" ? "New sales order" : section === "Cash flow" ? "Record payment" : "New purchase"}</button></div></div>
        {notice && <div className="notice" role="status"><span><Check size={18}/>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={17}/></button></div>}
        {!ready ? <div className="loading-state">Loading your empty workspace…</div> : <>
          {section === "Overview" && <>
            <div className="workflow-banner"><div className="workflow-copy"><span className="workflow-icon"><ClipboardList size={21}/></span><div><strong>Your order-to-cash workflow</strong><p>Record the purchase to create stock. Sell from that stock, invoice the confirmed order, then track each payment.</p></div></div><button className="workflow-action" onClick={openPurchase}><Plus size={17}/> Start with a purchase</button></div>
          </>}
          <div className="stat-grid">
            <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-stock"><Boxes size={19}/></span><span className="stat-period">Available stock</span></div><div className="stat-value">{available.toLocaleString("en-IN")} <small>units</small></div><div className="stat-foot">{store.batches.length} purchase batches</div></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-revenue"><CircleDollarSign size={20}/></span><span className="stat-period">Confirmed sales</span></div><div className="stat-value">{money(salesTotal)}</div><div className="stat-foot">{store.orders.filter(order=>order.status!=="Draft").length} confirmed orders</div></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-expense"><ArrowDownRight size={19}/></span><span className="stat-period">Supplier dues</span></div><div className="stat-value">{money(supplierDues)}</div><div className="stat-foot">{store.purchases.filter(purchase=>purchase.paid<purchase.quantity*(purchase.materialCost+purchase.manufacturingCost)).length} unpaid purchases</div></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-profit"><Activity size={19}/></span><span className="stat-period">Gross profit</span></div><div className="stat-value">{money(salesTotal - costTotal)}</div><div className="stat-foot">Sales value minus FIFO product cost</div></article>
          </div>
          {section === "Overview" && <div className="content-grid">
            <section className="panel overview-panel"><div className="panel-heading"><div><h2>Inventory and order status</h2><p>Live totals from the records you enter.</p></div><button className="text-action" onClick={()=>setPage("Inventory")}>Inventory details <ArrowRight size={16}/></button></div>
              {store.batches.length===0 ? <EmptyState icon={Boxes} title="Inventory is empty" copy="Add a purchase with its item, quantity and costs. That receipt will create your first stock lot." action="Add first purchase" onAction={openPurchase}/> : <div className="overview-inventory"><div className="mini-total"><span>Stock on hand</span><strong>{available.toLocaleString("en-IN")} units</strong></div><div className="mini-total"><span>Inventory value at cost</span><strong>{money(inventoryValue)}</strong></div><div className="mini-total"><span>Sales orders waiting for confirmation</span><strong>{pendingDrafts}</strong></div><button className="button secondary" onClick={openOrder}><Plus size={16}/>Create order from stock</button></div>}
            </section>
            <section className="panel cash-panel"><div className="panel-heading"><div><h2>Cash position</h2><p>Only recorded payments affect cash.</p></div><button className="text-action" onClick={()=>setPage("Cash flow")}>Open ledger <ArrowRight size={16}/></button></div><div className="cash-balance"><div className="cash-icon"><Wallet size={21}/></div><div><span>Net recorded cash movement</span><strong>{money(paidIn-paidOut)}</strong></div></div><div className="cash-flow-row"><div><span><i className="flow-dot in-dot"/>Customer receipts</span><strong>{money(paidIn)}</strong></div><div><span><i className="flow-dot out-dot"/>Supplier payments</span><strong>{money(paidOut)}</strong></div></div><div className="cash-divider"/><button className="payable-row clickable-row" onClick={()=>setPage("Purchases")}><span className="payable-copy"><strong>Supplier balance due</strong><span>See each purchase and its payment balance</span></span><span className="payable-amount">{money(supplierDues)}<ArrowRight size={16}/></span></button></section>
          </div>}
          {section === "Inventory" && <section className="panel data-panel"><div className="panel-heading"><div><h2>Stock lots</h2><p>Each purchase is a separate lot. Order confirmation consumes the oldest lot first.</p></div><button className={`filter-button ${lowOnly?"filter-active":""}`} onClick={()=>setLowOnly(value=>!value)}>{lowOnly?"Show all lots":"Low stock only"}</button></div><div className="table-wrap"><table><thead><tr><th>PRODUCT / BATCH</th><th>RECEIVED</th><th>QUANTITY IN</th><th>ON HAND</th><th>MATERIAL COST</th><th>MAKE COST</th><th>UNIT COST</th><th>WAREHOUSE</th></tr></thead><tbody>{filteredBatches.map(batch=><tr key={batch.id}><td><span className="cell-main">{batch.product}</span><span className="cell-sub">{batch.id} · {batch.category}</span></td><td>{dateLabel(batch.received)}</td><td>{batch.quantity} pcs</td><td><span className={`stock-pill ${batch.remaining<20?"warning":""}`}>{batch.remaining} pcs</span></td><td>{money(batch.materialCost)}</td><td>{money(batch.manufacturingCost)}</td><td><strong>{money(batch.materialCost+batch.manufacturingCost)}</strong></td><td>{batch.warehouse}</td></tr>)}</tbody></table>{filteredBatches.length===0&&<EmptyState icon={Boxes} title={store.batches.length===0?"No stock lots yet":"No lots match your search"} copy={store.batches.length===0?"Create a purchase to receive inventory. Each receipt remains separately traceable.":"Try another item, batch number or warehouse."} action={store.batches.length===0?"Record a purchase":undefined} onAction={store.batches.length===0?openPurchase:undefined}/>}</div></section>}
          {section === "Purchases" && <section className="panel data-panel"><div className="panel-heading"><div><h2>Purchases &amp; supplier balances</h2><p>Purchase cost and manufacturing cost form the FIFO unit cost. Payments reduce the due balance.</p></div><button className="button primary" onClick={()=>setShowModal("purchase")}><Plus size={17}/>New purchase</button></div><div className="table-wrap"><table><thead><tr><th>PURCHASE / SUPPLIER</th><th>PRODUCT</th><th>DATE</th><th>QUANTITY</th><th>TOTAL COST</th><th>PAID</th><th>BALANCE DUE</th><th>ACTION</th></tr></thead><tbody>{filteredPurchases.map(purchase=>{const total=purchase.quantity*(purchase.materialCost+purchase.manufacturingCost),due=total-purchase.paid;return <tr key={purchase.id}><td><span className="cell-main">{purchase.supplier}</span><span className="cell-sub">{purchase.id}{purchase.reference?` · ${purchase.reference}`:""}</span></td><td>{purchase.product}</td><td>{dateLabel(purchase.date)}</td><td>{purchase.quantity} pcs</td><td>{money(total)}</td><td>{money(purchase.paid)}</td><td><strong>{money(due)}</strong></td><td>{due>0?<button className="table-action" onClick={()=>setShowModal("supplier-payment")}>Pay supplier <ArrowRight size={15}/></button>:<span className="status-pill paid">Settled</span>}</td></tr>})}</tbody></table>{filteredPurchases.length===0&&<EmptyState icon={Package} title={store.purchases.length===0?"No purchases yet":"No purchases match your search"} copy={store.purchases.length===0?"Record a purchase to add its costs, create a supplier balance and receive stock into inventory.":"Try another supplier or product name."} action={store.purchases.length===0?"Record first purchase":undefined} onAction={store.purchases.length===0?()=>setShowModal("purchase"):undefined}/>}</div></section>}
          {section === "Sales" && <section className="panel data-panel"><div className="panel-heading"><div><h2>Sales order workflow</h2><p>Create a draft, confirm it to deduct FIFO stock, generate the invoice, then record customer payments.</p></div><button className="button primary" onClick={openOrder} disabled={available===0}><Plus size={17}/>New sales order</button></div><div className="order-flow-note"><span>1. Draft order</span><ArrowRight size={16}/><span>2. Confirm &amp; deduct stock</span><ArrowRight size={16}/><span>3. Generate invoice</span><ArrowRight size={16}/><span>4. Record payment</span></div><div className="table-wrap"><table><thead><tr><th>ORDER / CUSTOMER</th><th>PRODUCT</th><th>CHANNEL</th><th>QUANTITY</th><th>ORDER TOTAL</th><th>PAID / DUE</th><th>STATUS</th><th>NEXT STEP</th></tr></thead><tbody>{filteredOrders.map(order=>{const total=orderTotal(order);return <tr key={order.id}><td><span className="cell-main">{order.customer}</span><span className="cell-sub">{order.id} · {dateLabel(order.created)}</span></td><td>{order.product}</td><td>{order.channel}</td><td>{order.quantity} pcs</td><td>{money(total)}</td><td><span className="cell-main">{money(order.paid)} paid</span><span className="cell-sub">{money(Math.max(0,total-order.paid))} due</span></td><td><span className={`status-pill ${order.status.toLowerCase()}`}>{order.status}</span></td><td>{order.status==="Draft"?<button className="table-action" onClick={()=>confirmOrder(order)}>Confirm order <Check size={15}/></button>:order.status==="Confirmed"?<button className="table-action" onClick={()=>invoiceOrder(order)}>Generate invoice <FileText size={15}/></button>:order.status==="Paid"?<button className="table-action" onClick={()=>{setSelectedOrderId(order.id);setShowModal("invoice")}}>View invoice <FileText size={15}/></button>:<div className="action-pair"><button className="table-action" onClick={()=>{setSelectedOrderId(order.id);setShowModal("invoice")}}>Invoice <FileText size={14}/></button>{total>order.paid&&<button className="table-action" onClick={()=>setShowModal("customer-payment")}>Receive payment</button>}</div>}</td></tr>})}</tbody></table>{filteredOrders.length===0&&<EmptyState icon={ShoppingBag} title={store.orders.length===0?"No sales orders yet":"No orders match your search"} copy={store.orders.length===0?(available>0?"Create a draft from your available stock. Confirm it to deduct the oldest lot, then generate the invoice.":"Receive stock from a purchase first. Available products will appear in the sales order form."):"Try another order number, customer or status."} action={available>0&&store.orders.length===0?"Create first order":undefined} onAction={available>0&&store.orders.length===0?openOrder:undefined}/>}</div></section>}
          {section === "Cash flow" && <section className="panel data-panel"><div className="panel-heading"><div><h2>Cash ledger</h2><p>Cash moves only when you record a customer receipt or supplier payment.</p></div><div className="heading-actions"><button className="button secondary" onClick={()=>setShowModal("supplier-payment")} disabled={supplierDues<=0}>Pay supplier</button><button className="button primary" onClick={()=>setShowModal("customer-payment")} disabled={receivables<=0}><Plus size={17}/>Receive payment</button></div></div><div className="ledger-summary"><div><span>Cash received</span><strong className="positive-amount">{money(paidIn)}</strong></div><div><span>Supplier payments</span><strong className="negative-amount">{money(paidOut)}</strong></div><div><span>Net cash movement</span><strong>{money(paidIn-paidOut)}</strong></div><div><span>Outstanding customer invoices</span><strong>{money(receivables)}</strong></div></div><div className="table-wrap"><table><thead><tr><th>DATE</th><th>TYPE</th><th>PARTY</th><th>REFERENCE</th><th>METHOD</th><th>MONEY IN</th><th>MONEY OUT</th></tr></thead><tbody>{store.payments.map(payment=><tr key={payment.id}><td>{dateLabel(payment.date)}</td><td><span className={`ledger-type ${payment.direction}`}>{payment.direction==="in"?<ArrowDownLeft size={15}/>:<ArrowUpRight size={15}/>} {payment.direction==="in"?"Customer receipt":"Supplier payment"}</span></td><td><strong>{payment.party}</strong></td><td>{payment.reference}</td><td>{payment.method}</td><td className="positive-amount">{payment.direction==="in"?money(payment.amount):"—"}</td><td className="negative-amount">{payment.direction==="out"?money(payment.amount):"—"}</td></tr>)}</tbody></table>{store.payments.length===0&&<EmptyState icon={Wallet} title="No cash movements yet" copy="Once you record a customer payment or pay a supplier, each transaction will appear in this ledger."/>}</div></section>}
          {section === "Reports" && <section className="panel data-panel"><div className="panel-heading"><div><h2>Sales &amp; margin report</h2><p>Calculated from confirmed orders and the FIFO cost of the stock sold.</p></div><button className="button secondary" onClick={exportReport}><Download size={17}/>Download CSV</button></div><div className="ledger-summary report-summary"><div><span>Invoiced sales value</span><strong>{money(salesTotal)}</strong></div><div><span>FIFO product + make cost</span><strong>{money(costTotal)}</strong></div><div><span>Gross profit before other expenses</span><strong className={salesTotal-costTotal>=0?"positive-amount":"negative-amount"}>{money(salesTotal-costTotal)}</strong></div><div><span>Gross margin</span><strong>{salesTotal?`${((salesTotal-costTotal)/salesTotal*100).toFixed(1)}%`:"0.0%"}</strong></div></div><div className="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>PRODUCT</th><th>QUANTITY</th><th>SALES VALUE</th><th>FIFO COST</th><th>GROSS PROFIT</th></tr></thead><tbody>{store.orders.filter(order=>order.status!=="Draft").map(order=><tr key={order.id}><td><span className="cell-main">{order.invoice??order.id}</span></td><td>{order.customer}</td><td>{order.product}</td><td>{order.quantity} pcs</td><td>{money(orderTotal(order))}</td><td>{money(order.cogs)}</td><td className={orderTotal(order)-order.cogs>=0?"positive-amount":"negative-amount"}>{money(orderTotal(order)-order.cogs)}</td></tr>)}</tbody></table>{store.orders.every(order=>order.status==="Draft")&&<EmptyState icon={FileChartColumn} title="No confirmed sales to report" copy="Once a sales order is confirmed, its invoice value and FIFO cost will appear here."/>}</div></section>}
        </>}
        <footer className="page-footer"><span><Sparkles size={15}/>D2 Garments · Order to cash</span><span>Your workspace data is stored in this browser <i>·</i><button onClick={()=>setShowModal("reset")}>Reset workspace</button></span></footer>
      </div>
    </main>
    {showModal && <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setShowModal(null)}}>
      {showModal==="invoice"&&currentOrder?<div className="modal invoice-modal"><div className="invoice-top"><div><span className="invoice-brand">D2 GARMENTS</span><span className="invoice-label">TAX INVOICE</span></div><button className="icon-button" onClick={()=>setShowModal(null)} aria-label="Close invoice"><X size={20}/></button></div><div className="invoice-number"><div><span>Invoice number</span><strong>{currentOrder.invoice??"Invoice pending"}</strong></div><div><span>Invoice date</span><strong>{dateLabel(today())}</strong></div></div><div className="bill-to"><span>BILL TO</span><strong>{currentOrder.customer}</strong><small>{currentOrder.channel} · Order {currentOrder.id}</small></div><div className="invoice-line"><span><strong>{currentOrder.product}</strong><small>{currentOrder.quantity} units × {money(currentOrder.price)} per unit</small></span><strong>{money(currentOrder.quantity*currentOrder.price)}</strong></div><div className="invoice-totals"><span>Subtotal <strong>{money(currentOrder.quantity*currentOrder.price)}</strong></span><span>Tax ({currentOrder.taxRate}%) <strong>{money(currentOrder.quantity*currentOrder.price*currentOrder.taxRate/100)}</strong></span><span className="invoice-grand">Invoice total <strong>{money(orderTotal(currentOrder))}</strong></span><span>Paid to date <strong>{money(currentOrder.paid)}</strong></span><span>Balance due <strong>{money(Math.max(0,orderTotal(currentOrder)-currentOrder.paid))}</strong></span></div><div className="modal-actions"><button className="button secondary" onClick={()=>window.print()}><Printer size={17}/>Print invoice</button>{orderTotal(currentOrder)>currentOrder.paid&&<button className="button primary" onClick={()=>setShowModal("customer-payment")}><Plus size={17}/>Record payment</button>}</div></div>
      :showModal==="reset"?<div className="modal reset-modal"><div className="modal-head"><span className="modal-symbol"><Settings2 size={20}/></span><button className="icon-button" onClick={()=>setShowModal(null)} aria-label="Close reset dialog"><X size={19}/></button></div><h2>Reset this workspace?</h2><p>This clears purchases, inventory batches, sales orders, invoices and cash transactions saved in this browser. This cannot be undone.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setShowModal(null)}>Keep my data</button><button className="button danger" onClick={resetAll}>Clear all workspace data</button></div></div>
      :<form className="modal" onSubmit={submitForm}>
        <div className="modal-head"><span className="modal-symbol">{showModal==="purchase"?<Package size={20}/>:showModal==="order"?<ShoppingBag size={20}/>:showModal==="supplier-payment"?<Truck size={20}/>:<Wallet size={20}/>}</span><button type="button" className="icon-button" onClick={()=>setShowModal(null)} aria-label="Close dialog"><X size={19}/></button></div>
        <h2>{showModal==="purchase"?"Record a purchase":showModal==="order"?"Create sales order":showModal==="supplier-payment"?"Pay a supplier":"Receive customer payment"}</h2>
        <p>{showModal==="purchase"?"A confirmed purchase adds a stock batch and opens a supplier balance.":showModal==="order"?"This creates a draft. Confirm it from Sales to consume the oldest stock batch.":showModal==="supplier-payment"?"Select the purchase this payment belongs to. Its due balance will reduce.":"Record a receipt against an invoiced sales order."}</p>
        {showModal==="purchase"?<>
          <label>Supplier name<input name="supplier" required placeholder="Supplier or manufacturer"/></label>
          <div className="form-row"><label>Product name<input name="product" required placeholder="e.g. Cotton crew-neck tee"/></label><label>Category<select name="category"><option>Basics</option><option>T-shirts</option><option>Shirts</option><option>Outerwear</option><option>Bottoms</option><option>Other</option></select></label></div>
          <div className="form-row"><label>Quantity received<input name="quantity" required type="number" min="1" step="1" placeholder="0"/></label><label>Material cost per unit (₹)<input name="materialCost" required type="number" min="0" step="0.01" placeholder="0.00"/></label></div>
          <div className="form-row"><label>Manufacturing cost per unit (₹)<input name="manufacturingCost" required type="number" min="0" step="0.01" placeholder="0.00"/></label><label>Warehouse<select name="warehouse"><option>Warehouse A</option><option>Warehouse B</option><option>Storefront</option></select></label></div>
          <label>Supplier invoice / reference<input name="reference" placeholder="Optional reference number"/></label>
        </>:showModal==="order"?<>
          <label>Customer / buyer<input name="customer" required placeholder="Buyer or business name"/></label>
          <div className="form-row"><label>Product<select name="product" required defaultValue=""><option value="">Choose available product</option>{[...new Set(store.batches.filter(batch=>batch.remaining>0).map(batch=>batch.product))].map(product=><option key={product}>{product}</option>)}</select></label><label>Order type<select name="channel"><option>Bulk order</option><option>Single piece</option><option>Container</option><option>Retail</option></select></label></div>
          <div className="form-row"><label>Quantity<input name="quantity" required type="number" min="1" step="1" placeholder={`Up to ${available} available`}/></label><label>Price per unit (₹)<input name="price" required type="number" min="0.01" step="0.01" placeholder="0.00"/></label></div>
          <div className="form-row"><label>Tax rate (%)<input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue="0"/></label><label>Available units<span className="form-readout">{available.toLocaleString("en-IN")} total</span></label></div>
        </>:<>
          <label>{showModal==="supplier-payment"?"Purchase / supplier account":"Invoiced sales order"}<select name="target" required defaultValue="">{showModal==="supplier-payment"?store.purchases.filter(item=>item.quantity*(item.materialCost+item.manufacturingCost)>item.paid).map(item=><option key={item.id} value={item.id}>{item.supplier} · {item.product} · due {money(item.quantity*(item.materialCost+item.manufacturingCost)-item.paid)}</option>):store.orders.filter(item=>item.status==="Invoiced"&&orderTotal(item)>item.paid).map(item=><option key={item.id} value={item.id}>{item.customer} · {item.invoice} · due {money(orderTotal(item)-item.paid)}</option>)}</select></label>
          <div className="form-row"><label>Amount (₹)<input name="amount" required type="number" min="0.01" step="0.01" placeholder="Payment amount"/></label><label>Payment method<select name="method"><option>Bank transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option></select></label></div>
          <label>Reference / note<input name="reference" placeholder="Optional transaction reference"/></label>
        </>}
        <div className="modal-actions"><button className="button secondary" type="button" onClick={()=>setShowModal(null)}>Cancel</button><button className="button primary" type="submit"><Check size={17}/>{showModal==="purchase"?"Confirm purchase & receive stock":showModal==="order"?"Create draft order":showModal==="supplier-payment"?"Record supplier payment":"Record customer receipt"}</button></div>
      </form>}
    </div>}
    <style jsx global>{`@media print { body * { visibility: hidden !important; } .invoice-modal, .invoice-modal * { visibility: visible !important; } .invoice-modal { position: fixed !important; inset: 0 !important; width: 100% !important; max-width: 100% !important; box-shadow: none !important; border: 0 !important; } .invoice-modal .modal-actions, .invoice-modal .icon-button { display: none !important; } }`}</style>
  </div>;
}
