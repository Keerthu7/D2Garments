"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes,
  Check, ChevronDown, ChevronRight, CircleDollarSign, ClipboardList, Download,
  FileChartColumn, FileText, LayoutDashboard, Menu, Package, Pencil, Plus,
  Printer, Search, Settings2, ShoppingBag, Trash2, Wallet, X,
} from "lucide-react";

type Section = "Overview" | "Inventory" | "Vendors" | "Purchases" | "Sales" | "Cash flow" | "Reports" | "Activity log" | "Profile";
type VendorProduct = { id: string; name: string; sku: string; category: string };
type Vendor = { id: string; name: string; phone: string; email: string; address: string; bank: string; accountName: string; accountNumber: string; ifsc: string; createdAt: string; products: VendorProduct[] };
type PurchaseLine = { id: string; productId: string; name: string; sku: string; category: string; quantity: number; materialCost: number; manufacturingCost: number; returned: number };
type Purchase = { id: string; vendorId: string; vendorName: string; reference: string; date: string; paid: number; items: PurchaseLine[] };
type Batch = { id: string; purchaseId: string; lineId: string; vendorId: string; vendorName: string; productId: string; product: string; sku: string; category: string; received: string; quantity: number; remaining: number; materialCost: number; manufacturingCost: number; warehouse: string };
type SaleLine = { id: string; productId: string; product: string; quantity: number; price: number; taxRate: number; cogs: number; allocations: { batchId: string; quantity: number }[] };
type Order = { id: string; invoice?: string; customer: string; channel: string; created: string; status: "Draft" | "Confirmed" | "Invoiced" | "Paid"; paid: number; items: SaleLine[] };
type PurchaseReturn = { id: string; purchaseId: string; vendorId: string; vendorName: string; lineId: string; productId: string; product: string; quantity: number; amount: number; disposition: "Refund due" | "Vendor credit"; refunded: number; reason: string; date: string };
type Payment = { id: string; date: string; kind: "Customer receipt" | "Supplier payment" | "Supplier refund"; party: string; reference: string; method: string; amount: number; linkId: string };
type LogEntry = { id: string; dateTime: string; actor: string; action: string; record: string; detail: string };
type Profile = { name: string; email: string; phone: string; address: string; bank: string; accountName: string; accountNumber: string; ifsc: string; gstin: string };
type Store = { vendors: Vendor[]; purchases: Purchase[]; batches: Batch[]; orders: Order[]; returns: PurchaseReturn[]; payments: Payment[]; logs: LogEntry[]; profile: Profile };
type Modal = "purchase" | "vendor" | "product" | "order" | "supplier-payment" | "customer-payment" | "supplier-refund" | "purchase-return" | "invoice" | "reset" | "edit-payment" | null;

const STORE_KEY = "d2-garments-workspace-v3";
const PREVIOUS_KEY = "d2-garments-workspace-v2";
const EMPTY_PROFILE: Profile = { name: "D2 Garments", email: "", phone: "", address: "", bank: "", accountName: "", accountNumber: "", ifsc: "", gstin: "" };
const EMPTY: Store = { vendors: [], purchases: [], batches: [], orders: [], returns: [], payments: [], logs: [], profile: EMPTY_PROFILE };
const sections: { name: Section; icon: typeof LayoutDashboard }[] = [
  { name: "Overview", icon: LayoutDashboard }, { name: "Inventory", icon: Boxes },
  { name: "Vendors", icon: Package }, { name: "Purchases", icon: ClipboardList },
  { name: "Sales", icon: ShoppingBag }, { name: "Cash flow", icon: Wallet },
  { name: "Reports", icon: FileChartColumn }, { name: "Activity log", icon: Activity },
  { name: "Profile", icon: Settings2 },
];
const orderTypes = ["Retail", "Bulk", "Bulk order", "Container", "Wholesale"];
const money = (amount: number) => `₹${Math.round(amount).toLocaleString("en-IN")}`;
const isoDate = () => { const date=new Date();date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,10); };
const id = (prefix: string) => `${prefix}-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 90 + 10)}`;
const dateText = (date: string) => date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const lineTotal = (line: PurchaseLine) => line.quantity * (line.materialCost + line.manufacturingCost);
const purchaseTotal = (purchase: Purchase) => purchase.items.reduce((sum, line) => sum + lineTotal(line), 0);
const saleSubtotal = (order: Order) => order.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
const saleTotal = (order: Order) => order.items.reduce((sum, item) => sum + item.quantity * item.price * (1 + item.taxRate / 100), 0);
const saleCost = (order: Order) => order.items.reduce((sum, item) => sum + item.cogs, 0);
const returnedTotal = (store: Store, purchaseId: string) => store.returns.filter(item => item.purchaseId === purchaseId).reduce((sum, item) => sum + item.amount, 0);
const purchaseDue = (store: Store, purchase: Purchase) => Math.max(0, purchaseTotal(purchase) - returnedTotal(store, purchase.id) - purchase.paid);
const refundDue = (store: Store, purchaseId: string) => store.returns.filter(item => item.purchaseId === purchaseId && item.disposition === "Refund due").reduce((sum, item) => sum + item.amount - item.refunded, 0);
const newVendor = (name: string, data?: Partial<Vendor>): Vendor => ({ id: id("VEN"), name, phone: "", email: "", address: "", bank: "", accountName: "", accountNumber: "", ifsc: "", createdAt: isoDate(), products: [], ...data });
const slug = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function migratePrevious(previous: Partial<Store> & Record<string, unknown>): Store {
  if (Array.isArray(previous.vendors)) return { ...EMPTY, ...previous, profile: { ...EMPTY_PROFILE, ...(previous.profile as Profile | undefined) } } as Store;
  const vendors: Vendor[] = [];
  const purchases: Purchase[] = [];
  const batches: Batch[] = [];
  const productIds = new Map<string, VendorProduct>();
  const legacyPurchases = (previous.purchases ?? []) as Array<Record<string, unknown>>;
  const legacyBatches = (previous.batches ?? []) as Array<Record<string, unknown>>;
  for (const old of legacyPurchases) {
    const name = String(old.supplier ?? "Legacy supplier");
    let vendor = vendors.find(item => item.name.toLowerCase() === name.toLowerCase());
    if (!vendor) { vendor = newVendor(name); vendors.push(vendor); }
    const rawItems = Array.isArray(old.items) ? old.items as Array<Record<string, unknown>> : [old];
    const items: PurchaseLine[] = rawItems.map(raw => {
      const productName = String(raw.name ?? raw.product ?? "Unnamed product");
      const key = `${vendor!.id}:${slug(productName)}`;
      let product = productIds.get(key);
      if (!product) { product = { id: id("SKU"), name: productName, sku: "", category: String(raw.category ?? "Other") }; productIds.set(key, product); vendor!.products.push(product); }
      const oldBatch = legacyBatches.find(b => b.purchaseId === old.id && String(b.product) === productName);
      return { id: String(raw.id ?? id("ITM")), productId: product.id, name: product.name, sku: String(raw.sku ?? oldBatch?.sku ?? ""), category: String(raw.category ?? oldBatch?.category ?? "Other"), quantity: Number(raw.quantity ?? 0), materialCost: Number(raw.materialCost ?? 0), manufacturingCost: Number(raw.manufacturingCost ?? 0), returned: 0 };
    });
    purchases.push({ id: String(old.id ?? id("PUR")), vendorId: vendor.id, vendorName: vendor.name, reference: String(old.reference ?? ""), date: String(old.date ?? isoDate()), paid: Number(old.paid ?? 0), items });
  }
  for (const raw of legacyBatches) {
    const purchase = purchases.find(item => item.id === raw.purchaseId);
    const line = purchase?.items.find(item => item.name === raw.product);
    if (purchase && line) batches.push({ id: String(raw.id ?? id("LOT")), purchaseId: purchase.id, lineId: line.id, vendorId: purchase.vendorId, vendorName: purchase.vendorName, productId: line.productId, product: line.name, sku: line.sku, category: line.category, received: String(raw.received ?? isoDate()), quantity: Number(raw.quantity ?? line.quantity), remaining: Number(raw.remaining ?? 0), materialCost: Number(raw.materialCost ?? line.materialCost), manufacturingCost: Number(raw.manufacturingCost ?? line.manufacturingCost), warehouse: String(raw.warehouse ?? "Warehouse A") });
  }
  const orders = ((previous.orders ?? []) as Array<Record<string, unknown>>).map(raw => {
    const oldItems = Array.isArray(raw.items) ? raw.items as Array<Record<string, unknown>> : [raw];
    return { id: String(raw.id ?? id("ORD")), invoice: raw.invoice ? String(raw.invoice) : undefined, customer: String(raw.customer ?? ""), channel: String(raw.channel ?? "Bulk"), created: String(raw.created ?? isoDate()), status: (raw.status ?? "Draft") as Order["status"], paid: Number(raw.paid ?? 0), items: oldItems.map(item => { const name = String(item.product ?? item.name ?? ""); return { id: String(item.id ?? id("SLI")), productId: batches.find(batch => batch.product === name)?.productId ?? "", product: name, quantity: Number(item.quantity ?? 0), price: Number(item.price ?? 0), taxRate: Number(item.taxRate ?? 0), cogs: Number(item.cogs ?? raw.cogs ?? 0), allocations: [] }; }) };
  }) as Order[];
  const payments = ((previous.payments ?? []) as Array<Record<string, unknown>>).map(raw => {
    const kind = String(raw.kind ?? (raw.direction === "in" ? "Customer receipt" : "Supplier payment")) as Payment["kind"];
    const party = String(raw.party ?? "");
    const linkId = String(raw.linkId ?? (kind === "Customer receipt" ? orders.find(o=>o.customer===party)?.id : purchases.find(p=>p.vendorName===party)?.id) ?? "");
    return { id: String(raw.id ?? id("PAY")), date: String(raw.date ?? isoDate()), kind, party, reference: String(raw.reference ?? ""), method: String(raw.method ?? "Other"), amount: Number(raw.amount ?? 0), linkId };
  });
  return { ...EMPTY, vendors, purchases, batches, orders, payments, logs: (previous.logs ?? []) as LogEntry[], profile: { ...EMPTY_PROFILE, ...(previous.profile as Partial<Profile> ?? {}) } };
}

function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: typeof Package; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={24}/></span><strong>{title}</strong><p>{text}</p>{action && onAction && <button className="button primary" onClick={onAction}><Plus size={17}/>{action}</button>}</div>;
}

export default function Dashboard() {
  const [section, setSection] = useState<Section>("Overview");
  const [store, setStore] = useState<Store>(EMPTY);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [editId, setEditId] = useState("");
  const [editReturnId, setEditReturnId] = useState("");
  const [vendorContext, setVendorContext] = useState("");
  const [lineCount, setLineCount] = useState(1);
  const [continueToPurchase, setContinueToPurchase] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [message, setMessage] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [refundReturnId, setRefundReturnId] = useState("");

  useEffect(() => {
    try {
      let saved = localStorage.getItem(STORE_KEY);
      if (!saved) saved = localStorage.getItem(PREVIOUS_KEY);
      if (saved) setStore(migratePrevious(JSON.parse(saved)));
    } catch { setStore(EMPTY); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORE_KEY, JSON.stringify(store)); }, [store, ready]);
  function log(next: Store, action: string, record: string, detail: string): Store {
    return { ...next, logs: [{ id: id("LOG"), dateTime: new Date().toISOString(), actor: "Admin", action, record, detail }, ...next.logs] };
  }
  function notify(text: string) { setMessage(text); window.setTimeout(() => setMessage(current => current === text ? "" : current), 5000); }
  function open(sectionName: Section) { setSection(sectionName); setMobileNav(false); setSearch(""); }
  function startPurchase() {
    if(store.vendors.length===0){setContinueToPurchase(true);open("Vendors");showModal("vendor");notify("Add this supplier once. Next, the purchase form will open and you can add all of their product lines.");return;}
    setContinueToPurchase(false);open("Purchases");showModal("purchase");
  }
  const inRange = (date: string) => (!from || date.slice(0, 10) >= from) && (!to || date.slice(0, 10) <= to);
  const queryMatches = (text: string) => text.toLowerCase().includes(search.trim().toLowerCase());

  const vendors = useMemo(() => store.vendors.filter(vendor => inRange(vendor.createdAt) && queryMatches(`${vendor.name} ${vendor.phone} ${vendor.email} ${vendor.products.map(p => `${p.name} ${p.sku}`).join(" ")}`)), [store.vendors, from, to, search]);
  const purchases = useMemo(() => store.purchases.filter(p => inRange(p.date) && queryMatches(`${p.id} ${p.vendorName} ${p.reference} ${p.items.map(x => `${x.name} ${x.sku}`).join(" ")}`)), [store.purchases, from, to, search]);
  const batches = useMemo(() => store.batches.filter(b => inRange(b.received) && queryMatches(`${b.id} ${b.product} ${b.sku} ${b.category} ${b.vendorName} ${b.warehouse}`) && (!lowOnly || (b.remaining > 0 && b.remaining <= 20))), [store.batches, from, to, search, lowOnly]);
  const orders = useMemo(() => store.orders.filter(o => inRange(o.created) && queryMatches(`${o.id} ${o.invoice ?? ""} ${o.customer} ${o.channel} ${o.items.map(x => x.product).join(" ")} ${o.status}`)), [store.orders, from, to, search]);
  const cashRows = useMemo(() => store.payments.filter(p => inRange(p.date) && queryMatches(`${p.id} ${p.kind} ${p.party} ${p.reference} ${p.method}`)), [store.payments, from, to, search]);
  const logs = useMemo(() => store.logs.filter(item => inRange(item.dateTime) && queryMatches(`${item.actor} ${item.action} ${item.record} ${item.detail}`)), [store.logs, from, to, search]);

  const available = batchesFor(store, undefined).reduce((sum, batch) => sum + batch.remaining, 0);
  const inventoryValue = batchesFor(store, undefined).reduce((sum, batch) => sum + batch.remaining * (batch.materialCost + batch.manufacturingCost), 0);
  const saleValue = store.orders.filter(o => o.status !== "Draft" && inRange(o.created)).reduce((sum, o) => sum + saleTotal(o), 0);
  const taxableSales = store.orders.filter(o=>o.status!=="Draft"&&inRange(o.created)).reduce((sum,o)=>sum+saleSubtotal(o),0);
  const saleCogs = store.orders.filter(o => o.status !== "Draft" && inRange(o.created)).reduce((sum, o) => sum + saleCost(o), 0);
  const cashIn = store.payments.filter(p => p.kind === "Customer receipt" || p.kind === "Supplier refund").filter(p => inRange(p.date)).reduce((sum, p) => sum + p.amount, 0);
  const cashOut = store.payments.filter(p => p.kind === "Supplier payment" && inRange(p.date)).reduce((sum, p) => sum + p.amount, 0);
  const totalDue = store.purchases.reduce((sum, p) => sum + purchaseDue(store, p), 0);
  const totalRefundDue = store.returns.reduce((sum, r) => sum + (r.disposition === "Refund due" ? r.amount - r.refunded : 0), 0);
  const totalReceivable = store.orders.reduce((sum, o) => sum + (o.invoice ? saleTotal(o) - o.paid : 0), 0);
  const selectedOrder = store.orders.find(o => o.id === editId);
  const selectedReturn = store.returns.find(r => r.id === refundReturnId);
  const title = section === "Overview" ? "Business overview" : section;
  const description: Record<Section, string> = {
    "Overview": "Purchases, inventory, sales, invoices and cash flow in one place.",
    "Inventory": "Search stock lots, filter by received date, and return items to the vendor that supplied them.",
    "Vendors": "Maintain each supplier once and keep a separate product catalog for each one.",
    "Purchases": "Record multi-product purchases, edit or return a line, and track supplier balances.",
    "Sales": "Create orders from available stock, confirm, generate invoices and record receipts.",
    "Cash flow": "Customer receipts, supplier payments and supplier refunds with current balances.",
    "Reports": "Review purchases, sales, returns, margins and cash movements for a date range.",
    "Activity log": "Timestamped history of purchase, product, supplier, order and payment changes.",
    "Profile": "Company details are used in the From section of every generated sales invoice.",
  };

  function showModal(type: Modal, target = "") { setEditId(target); setEditReturnId("");setModal(type); const purchase=store.purchases.find(item=>item.id===target);const order=store.orders.find(item=>item.id===target);setLineCount(type==="purchase"&&purchase?purchase.items.length:type==="order"&&order?order.items.length:1); }

  function saveVendor(form: FormData, editing?: Vendor) {
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    if (store.vendors.some(v => v.id !== editing?.id && v.name.toLowerCase() === name.toLowerCase())) { notify("A supplier with that name already exists. Open the existing supplier instead."); return; }
    const vendor: Vendor = { ...(editing ?? newVendor(name)), name, phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? ""), address: String(form.get("address") ?? ""), bank: String(form.get("bank") ?? ""), accountName: String(form.get("accountName") ?? ""), accountNumber: String(form.get("accountNumber") ?? ""), ifsc: String(form.get("ifsc") ?? ""), products: editing?.products ?? [], createdAt: editing?.createdAt ?? isoDate() };
    setStore(current => log({ ...current, vendors: editing ? current.vendors.map(v => v.id === editing.id ? vendor : v) : [vendor, ...current.vendors], purchases: editing ? current.purchases.map(p=>p.vendorId===editing.id?{...p,vendorName:vendor.name}:p) : current.purchases, batches: editing ? current.batches.map(b=>b.vendorId===editing.id?{...b,vendorName:vendor.name}:b) : current.batches, returns: editing ? current.returns.map(r=>r.vendorId===editing.id?{...r,vendorName:vendor.name}:r) : current.returns, payments: editing ? current.payments.map(p=>p.party===editing.name?{...p,party:vendor.name}:p) : current.payments }, editing ? "Edited supplier profile" : "Created supplier", vendor.name, `${vendor.phone} ${vendor.email}`.trim()));
    if(continueToPurchase&&!editing){setContinueToPurchase(false);setSection("Purchases");showModal("purchase");notify(`${vendor.name} is saved. Add every product from this supplier to the purchase now.`);return;}
    setModal(null); notify(`${vendor.name} ${editing ? "updated" : "added to your supplier list"}.`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (modal === "vendor") { saveVendor(form, store.vendors.find(v => v.id === editId)); return; }
    if (modal === "product") {
      const vendor = store.vendors.find(v => v.id === editId); if (!vendor) return;
      const name = String(form.get("name") ?? "").trim(); const sku = String(form.get("sku") ?? "").trim();
      if (!name) return;
      if (vendor.products.some(p => p.id !== vendorContext && p.name.toLowerCase() === name.toLowerCase())) { notify("This supplier already has a product with that name."); return; }
      const product: VendorProduct = { id: vendorContext || id("SKU"), name, sku, category: String(form.get("category") ?? "Other") };
      setStore(current => log({ ...current, vendors: current.vendors.map(item => item.id === vendor.id ? { ...item, products: vendorContext ? item.products.map(p => p.id === vendorContext ? product : p) : [product, ...item.products] } : item) }, vendorContext ? "Edited supplier product" : "Added supplier product", `${vendor.name} / ${product.name}`, sku));
      setModal(null); setVendorContext(""); notify(`${product.name} saved under ${vendor.name}.`); return;
    }
    if (modal === "purchase") {
      const vendorId = String(form.get("vendorId") ?? ""); const vendor = store.vendors.find(v => v.id === vendorId); if (!vendor) { notify("Choose a supplier before saving this purchase."); return; }
      const items: PurchaseLine[] = [];
      for (let index = 0; index < lineCount; index++) {
        const name = String(form.get(`product-${index}`) ?? "").trim(); if (!name) continue;
        const existing = vendor.products.find(p => p.name.toLowerCase() === name.toLowerCase());
        const product: VendorProduct = existing ?? { id: id("SKU"), name, sku: String(form.get(`sku-${index}`) ?? "").trim(), category: String(form.get(`category-${index}`) ?? "Other") };
        if (items.some(item => item.productId === product.id)) { notify("A purchase can include a supplier product only once. Increase that line’s quantity instead."); return; }
        items.push({ id: id("ITM"), productId: product.id, name: product.name, sku: String(form.get(`sku-${index}`) || product.sku), category: String(form.get(`category-${index}`) || product.category), quantity: Number(form.get(`quantity-${index}`)), materialCost: Number(form.get(`material-${index}`)), manufacturingCost: Number(form.get(`making-${index}`)), returned: 0 });
      }
      if (!items.length || items.some(item => !item.quantity || item.quantity < 1)) { notify("Add at least one product with a valid quantity."); return; }
      const purchaseId = editId || id("PUR"); const old = store.purchases.find(p => p.id === purchaseId);
      if (old) {
        if(old.vendorId!==vendor.id&&(old.paid>0||store.returns.some(item=>item.purchaseId===old.id))){notify("A supplier cannot be changed after payments or returns have been recorded.");return;}
        const refreshedItems = items.map(item => { const previous = old.items.find(p => p.productId === item.productId); return previous ? { ...item, id: previous.id, returned: previous.returned } : item; });
        for (const previous of old.items) {
          const priorBatch = store.batches.find(b => b.purchaseId === old.id && b.lineId === previous.id);
          const nextLine = refreshedItems.find(i => i.id === previous.id);
          const soldOrReturned = previous.quantity - (priorBatch?.remaining ?? 0) - previous.returned;
          if (!nextLine && (soldOrReturned > 0 || previous.returned > 0)) { notify(`Cannot remove ${previous.name}; some units are already sold or returned. Edit the quantity instead.`); return; }
          if (nextLine && nextLine.quantity < soldOrReturned + previous.returned) { notify(`Quantity for ${previous.name} cannot be lower than sold or returned units.`); return; }
        }
        const nextPurchase: Purchase = { ...old, vendorId: vendor.id, vendorName: vendor.name, reference: String(form.get("reference") ?? ""), date: String(form.get("date") ?? old.date), items: refreshedItems };
        const removedLineIds = old.items.filter(previous=>!refreshedItems.some(item=>item.id===previous.id)).map(item=>item.id);
        const nextBatches = store.batches.filter(batch=>!(batch.purchaseId===old.id&&removedLineIds.includes(batch.lineId)));
        for (const item of refreshedItems) {
          const batch = nextBatches.find(b => b.purchaseId === old.id && b.lineId === item.id);
          if (batch) { const previous = old.items.find(p => p.id === item.id)!; const sold = previous.quantity - batch.remaining - previous.returned; batch.vendorId=vendor.id; batch.vendorName=vendor.name; batch.productId=item.productId; batch.product=item.name; batch.sku=item.sku; batch.category=item.category; batch.quantity = item.quantity; batch.remaining = item.quantity - sold - item.returned; batch.materialCost = item.materialCost; batch.manufacturingCost = item.manufacturingCost; }
          else nextBatches.unshift({ id: id("LOT"), purchaseId: old.id, lineId: item.id, vendorId: vendor.id, vendorName: vendor.name, productId: item.productId, product: item.name, sku: item.sku, category: item.category, received: nextPurchase.date, quantity: item.quantity, remaining: item.quantity, materialCost: item.materialCost, manufacturingCost: item.manufacturingCost, warehouse: String(form.get("warehouse") ?? "Warehouse A") });
        }
        const productAdds = items.filter(item => !vendor.products.some(p => p.id === item.productId)).map(item => ({ id: item.productId, name: item.name, sku: item.sku, category: item.category }));
        setStore(current => log({ ...current, vendors: current.vendors.map(v => v.id === vendor.id ? { ...v, products: [...productAdds, ...v.products] } : v), purchases: current.purchases.map(p => p.id === old.id ? nextPurchase : p), batches: nextBatches }, "Edited purchase", old.id, `${vendor.name} · ${items.length} products`));
        setModal(null); notify(`Purchase ${old.id} updated. Inventory quantities and costs were adjusted.`); return;
      }
      const date = String(form.get("date") ?? isoDate());
      const purchase: Purchase = { id: purchaseId, vendorId: vendor.id, vendorName: vendor.name, reference: String(form.get("reference") ?? "").trim(), date, paid: 0, items };
      const newProducts = items.filter(item => !vendor.products.some(p => p.id === item.productId)).map(item => ({ id: item.productId, name: item.name, sku: item.sku, category: item.category }));
      const newBatches = items.map(item => ({ id: id("LOT"), purchaseId, lineId: item.id, vendorId: vendor.id, vendorName: vendor.name, productId: item.productId, product: item.name, sku: item.sku, category: item.category, received: date, quantity: item.quantity, remaining: item.quantity, materialCost: item.materialCost, manufacturingCost: item.manufacturingCost, warehouse: String(form.get("warehouse") ?? "Warehouse A") }));
      setStore(current => log({ ...current, vendors: current.vendors.map(v => v.id === vendor.id ? { ...v, products: [...newProducts, ...v.products] } : v), purchases: [purchase, ...current.purchases], batches: [...newBatches, ...current.batches] }, "Created purchase and received stock", purchase.id, `${vendor.name} · ${items.length} product lines · ${money(purchaseTotal(purchase))}`));
      setModal(null); notify(`Purchase recorded for ${vendor.name}. ${items.length} product lots were added to inventory.`); return;
    }
    if (modal === "purchase-return") {
      const oldReturn=store.returns.find(item=>item.id===editReturnId);
      const purchase = store.purchases.find(p => p.id === (oldReturn?.purchaseId??editId)); if (!purchase) return;
      const lineId=String(form.get("lineId"));
      if(oldReturn&&lineId!==oldReturn.lineId){notify("Edit the same product lot on this return. Delete and recreate it only if no refund has been received.");return;}
      const line = purchase.items.find(item => item.id === lineId); if (!line) return;
      const quantity = Number(form.get("quantity"));
      const disposition=String(form.get("disposition")) as PurchaseReturn["disposition"];
      const returnValue=quantity*(line.materialCost+line.manufacturingCost);
      if(oldReturn&&returnValue<oldReturn.refunded){notify("The return value cannot be lower than the refund already received.");return;}
      if(oldReturn&&oldReturn.refunded>0&&disposition!==oldReturn.disposition){notify("Settlement type cannot change after a refund has been received.");return;}
      if(disposition==="Refund due"){
        const otherRefunds=store.returns.filter(r=>r.purchaseId===purchase.id&&r.disposition==="Refund due"&&r.id!==oldReturn?.id).reduce((sum,r)=>sum+r.amount,0);
        if(purchase.paid<otherRefunds+returnValue){notify("The supplier has not paid enough on this purchase to owe this refund. Choose Vendor credit or return fewer units.");return;}
      }
      const updatedBatches=store.batches.map(batch=>({...batch}));
      if(oldReturn){let restore=oldReturn.quantity;for(const batch of updatedBatches.filter(b=>b.purchaseId===purchase.id&&b.lineId===line.id)){batch.remaining+=restore;restore=0;break;}}
      const availableToReturn=updatedBatches.filter(b=>b.purchaseId===purchase.id&&b.lineId===line.id).reduce((sum,b)=>sum+b.remaining,0);
      if(!quantity||quantity>availableToReturn){notify(`Only ${availableToReturn} unreserved units from this vendor lot can be returned.`);return;}
      let remove=quantity;for(const batch of updatedBatches.filter(b=>b.purchaseId===purchase.id&&b.lineId===line.id).reverse()){const take=Math.min(remove,batch.remaining);batch.remaining-=take;remove-=take;if(!remove)break;}
      const returned:PurchaseReturn={id:oldReturn?.id??id("RET"),purchaseId:purchase.id,vendorId:purchase.vendorId,vendorName:purchase.vendorName,lineId:line.id,productId:line.productId,product:line.name,quantity,amount:returnValue,disposition,refunded:oldReturn?.refunded??0,reason:String(form.get("reason")??"").trim(),date:String(form.get("date")??isoDate())};
      const updatedPurchase={...purchase,items:purchase.items.map(item=>item.id===line.id?{...item,returned:item.returned-(oldReturn?.quantity??0)+quantity}:item)};
      const nextReturns=oldReturn?store.returns.map(item=>item.id===oldReturn.id?returned:item):[returned,...store.returns];
      setStore(current=>log({...current,batches:updatedBatches,purchases:current.purchases.map(p=>p.id===purchase.id?updatedPurchase:p),returns:nextReturns},oldReturn?"Edited purchase return":"Returned purchased stock",`${returned.vendorName} / ${returned.product}`,`${quantity} units · ${returned.disposition} · ${money(returned.amount)}`));
      setModal(null);setEditReturnId("");notify(`${oldReturn?"Return updated":"Return recorded"} against ${purchase.vendorName}. The correct inventory lot and balances were adjusted.`);return;
    }
    if (modal === "order") {
      const customer = String(form.get("customer") ?? "").trim(); const saleLines: SaleLine[] = [];
      for (let index = 0; index < lineCount; index++) {
        const productId = String(form.get(`product-${index}`) ?? ""); if (!productId) continue;
        const product = store.vendors.flatMap(v => v.products).find(p => p.id === productId); if (!product) continue;
        saleLines.push({ id: id("SLI"), productId, product: product.name, quantity: Number(form.get(`quantity-${index}`)), price: Number(form.get(`price-${index}`)), taxRate: Number(form.get(`tax-${index}`)) || 0, cogs: 0, allocations: [] });
      }
      if (!customer || !saleLines.length || saleLines.some(item => !item.quantity || !item.price)) { notify("Add a customer and at least one valid order line."); return; }
      const old=store.orders.find(item=>item.id===editId);
      if(old){
        const nextOrder:Order={...old,customer,channel:String(form.get("channel")),created:String(form.get("date")??old.created),items:saleLines};
        if(old.paid>saleTotal(nextOrder)){notify("The updated order total cannot be lower than payments already collected.");return;}
        let nextBatches=store.batches.map(batch=>({...batch}));
        if(old.status!=="Draft"){
          old.items.forEach(line=>line.allocations.forEach(allocation=>{const batch=nextBatches.find(item=>item.id===allocation.batchId);if(batch)batch.remaining+=allocation.quantity;}));
          for(const line of nextOrder.items){let left=line.quantity;const lots=nextBatches.filter(batch=>batch.productId===line.productId&&batch.remaining>0).sort((a,b)=>a.received.localeCompare(b.received));if(lots.reduce((sum,batch)=>sum+batch.remaining,0)<left){notify(`Not enough ${line.product} is available to save this edited order.`);return;}for(const batch of lots){if(!left)break;const take=Math.min(batch.remaining,left);batch.remaining-=take;left-=take;line.cogs+=take*(batch.materialCost+batch.manufacturingCost);line.allocations.push({batchId:batch.id,quantity:take});}}
        }
        setStore(current=>log({...current,batches:nextBatches,orders:current.orders.map(item=>item.id===old.id?nextOrder:item)},"Edited sales order",old.id,`${customer} · ${saleLines.length} products · ${money(saleTotal(nextOrder))}`));
        setModal(null);notify(`Sales order ${old.id} updated. Its stock allocations and FIFO costs were recalculated.`);return;
      }
      const order: Order = { id: id("ORD"), customer, channel: String(form.get("channel")), created: String(form.get("date") ?? isoDate()), status: "Draft", paid: 0, items: saleLines };
      setStore(current => log({ ...current, orders: [order, ...current.orders] }, "Created draft sales order", order.id, `${customer} · ${order.channel} · ${saleLines.length} items · ${money(saleTotal(order))}`));
      setModal(null); notify(`${order.id} saved as a draft. Confirm it from Sales to allocate stock.`); return;
    }
    if (modal === "supplier-payment" || modal === "customer-payment" || modal === "supplier-refund" || modal === "edit-payment") {
      const editing = modal === "edit-payment" ? store.payments.find(p => p.id === editId) : undefined;
      const kind = editing?.kind ?? (modal === "supplier-payment" ? "Supplier payment" : modal === "customer-payment" ? "Customer receipt" : "Supplier refund");
      const amount = Number(form.get("amount")); const method = String(form.get("method") ?? "Bank transfer");
      const linkId = editing?.linkId ?? String(form.get("target") ?? ""); const reference = String(form.get("reference") ?? "").trim();
      const delta = amount - (editing?.amount ?? 0);
      if (kind === "Supplier payment") {
        const purchase = store.purchases.find(p => p.id === linkId); if (!purchase || amount <= 0 || delta > purchaseDue(store, purchase) + (editing?.amount ?? 0)) { notify("Payment exceeds the supplier balance."); return; }
        const record: Payment = { id: editing?.id ?? id("PAY"), date: String(form.get("date") ?? isoDate()), kind, party: purchase.vendorName, reference: reference || purchase.id, method, amount, linkId };
        setStore(current => log({ ...current, purchases: current.purchases.map(p => p.id === linkId ? { ...p, paid: p.paid + delta } : p), payments: editing ? current.payments.map(p => p.id === editing.id ? record : p) : [record, ...current.payments] }, editing ? "Edited supplier payment" : "Recorded supplier payment", record.id, `${purchase.vendorName} · ${money(amount)} · ${method}`));
      } else if (kind === "Customer receipt") {
        const order = store.orders.find(o => o.id === linkId); if (!order || amount <= 0 || delta > saleTotal(order) - order.paid + (editing?.amount ?? 0)) { notify("Receipt exceeds the open invoice balance."); return; }
        const record: Payment = { id: editing?.id ?? id("REC"), date: String(form.get("date") ?? isoDate()), kind, party: order.customer, reference: reference || order.invoice || order.id, method, amount, linkId };
        setStore(current => log({ ...current, orders: current.orders.map(o => o.id === linkId ? { ...o, paid: o.paid + delta, status: o.paid + delta >= saleTotal(o) ? "Paid" : o.status } : o), payments: editing ? current.payments.map(p => p.id === editing.id ? record : p) : [record, ...current.payments] }, editing ? "Edited customer receipt" : "Received customer payment", record.id, `${order.customer} · ${money(amount)} · ${method}`));
      } else {
        const returned = store.returns.find(r => r.id === linkId); if (!returned || amount <= 0 || delta > returned.amount - returned.refunded + (editing?.amount ?? 0)) { notify("Refund exceeds the vendor refund balance."); return; }
        const record: Payment = { id: editing?.id ?? id("REF"), date: String(form.get("date") ?? isoDate()), kind: "Supplier refund", party: returned.vendorName, reference: reference || returned.id, method, amount, linkId };
        setStore(current => log({ ...current, returns: current.returns.map(r => r.id === linkId ? { ...r, refunded: r.refunded + delta } : r), payments: editing ? current.payments.map(p => p.id === editing.id ? record : p) : [record, ...current.payments] }, editing ? "Edited supplier refund receipt" : "Received supplier refund", record.id, `${returned.vendorName} · ${money(amount)} · ${method}`));
      }
      setModal(null); notify(`${editing ? "Payment updated" : "Payment recorded"}. Linked balances and the cash ledger are updated.`); return;
    }
    if (modal === null && section === "Profile") {
      const profile = Object.fromEntries(Object.keys(EMPTY_PROFILE).map(key => [key, String(form.get(key) ?? "").trim()])) as unknown as Profile;
      setStore(current => log({ ...current, profile }, "Updated company profile", profile.name, "Invoice From details and bank details saved")); notify("Company profile saved. New invoices will use these From details.");
    }
  }

  function confirmOrder(order: Order) {
    let workingBatches = store.batches.map(batch => ({ ...batch })); let lines = order.items.map(line => ({ ...line, allocations: [] as { batchId: string; quantity: number }[], cogs: 0 }));
    for (const line of lines) {
      let quantityLeft = line.quantity;
      const lots = workingBatches.filter(batch => batch.productId === line.productId && batch.remaining > 0).sort((a, b) => a.received.localeCompare(b.received));
      if (lots.reduce((sum, batch) => sum + batch.remaining, 0) < quantityLeft) { notify(`Not enough ${line.product} is available. Check the Inventory tab.`); return; }
      for (const batch of lots) { if (!quantityLeft) break; const take = Math.min(batch.remaining, quantityLeft); batch.remaining -= take; quantityLeft -= take; line.cogs += take * (batch.materialCost + batch.manufacturingCost); line.allocations.push({ batchId: batch.id, quantity: take }); }
    }
    const nextOrder = { ...order, items: lines, status: "Confirmed" as const };
    setStore(current => log({ ...current, batches: workingBatches, orders: current.orders.map(item => item.id === order.id ? nextOrder : item) }, "Confirmed sales order", order.id, `${order.customer} · ${order.items.reduce((sum, item) => sum + item.quantity, 0)} units deducted FIFO`)); notify(`${order.id} confirmed. Inventory was deducted from the oldest lots.`);
  }

  function createInvoice(order: Order) {
    const invoice = order.invoice || `INV-${order.id.replace("ORD-", "")}`;
    setStore(current => log({ ...current, orders: current.orders.map(item => item.id === order.id ? { ...item, invoice, status: "Invoiced" } : item) }, "Generated sales invoice", invoice, `To ${order.customer} · ${money(saleTotal(order))}`));
    setEditId(order.id); setModal("invoice");
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); submit(event); }

  function deletePurchase(purchase: Purchase) {
    if (purchase.paid || store.returns.some(r => r.purchaseId === purchase.id)) { notify("This purchase has payments or returns. Keep it in the audit trail and edit its remaining balance instead."); return; }
    const connected = store.batches.filter(b => b.purchaseId === purchase.id);
    if (connected.some(b => b.remaining !== b.quantity)) { notify("Stock from this purchase has already been sold or returned. It can’t be deleted safely."); return; }
    if (!window.confirm(`Delete purchase ${purchase.id} from ${purchase.vendorName}? Its untouched inventory lots will also be removed.`)) return;
    setStore(current => log({ ...current, purchases: current.purchases.filter(p => p.id !== purchase.id), batches: current.batches.filter(b => b.purchaseId !== purchase.id) }, "Deleted purchase", purchase.id, `${purchase.vendorName} · ${purchase.items.length} items`));
  }

  function deleteReturn(returned:PurchaseReturn) {
    if(returned.refunded>0){notify("A supplier refund has already been received. Keep this return in the audit trail and edit the linked refund instead.");return;}
    if(!window.confirm(`Delete return ${returned.id} for ${returned.product} to ${returned.vendorName}? The stock and supplier balance will be restored.`))return;
    const purchase=store.purchases.find(item=>item.id===returned.purchaseId);if(!purchase)return;
    const batches=store.batches.map(batch=>({...batch}));let remaining=returned.quantity;
    for(const batch of batches.filter(item=>item.purchaseId===returned.purchaseId&&item.lineId===returned.lineId)){const restore=Math.min(remaining,batch.quantity-batch.remaining);batch.remaining+=restore;remaining-=restore;if(!remaining)break;}
    const nextPurchase={...purchase,items:purchase.items.map(item=>item.id===returned.lineId?{...item,returned:Math.max(0,item.returned-returned.quantity)}:item)};
    setStore(current=>log({...current,batches,purchases:current.purchases.map(item=>item.id===purchase.id?nextPurchase:item),returns:current.returns.filter(item=>item.id!==returned.id)},"Deleted purchase return",returned.id,`${returned.vendorName} / ${returned.product} · ${returned.quantity} units restored`));
  }

  function deleteOrder(order: Order) {
    if (order.paid || store.payments.some(p => p.kind === "Customer receipt" && p.linkId === order.id)) { notify("This order has customer receipts. Keep it in the audit trail; reverse or edit the receipt first."); return; }
    if (!window.confirm(`Delete sales order ${order.id} for ${order.customer}?`)) return;
    const restored = store.batches.map(batch => ({ ...batch }));
    order.items.forEach(line => line.allocations.forEach(allocation => { const batch = restored.find(item => item.id === allocation.batchId); if (batch) batch.remaining += allocation.quantity; }));
    setStore(current => log({ ...current, batches: restored, orders: current.orders.filter(o => o.id !== order.id) }, "Deleted sales order", order.id, `${order.customer} · stock allocations restored`));
  }

  function deletePayment(payment: Payment) {
    if (!window.confirm(`Delete ${payment.kind.toLowerCase()} of ${money(payment.amount)} for ${payment.party}? The linked balance will be restored.`)) return;
    let next: Store = { ...store, payments: store.payments.filter(p => p.id !== payment.id) };
    if (payment.kind === "Supplier payment") next.purchases = next.purchases.map(p => p.id === payment.linkId ? { ...p, paid: Math.max(0, p.paid - payment.amount) } : p);
    if (payment.kind === "Customer receipt") next.orders = next.orders.map(o => o.id === payment.linkId ? { ...o, paid: Math.max(0, o.paid - payment.amount), status: o.status === "Paid" ? "Invoiced" : o.status } : o);
    if (payment.kind === "Supplier refund") next.returns = next.returns.map(r => r.id === payment.linkId ? { ...r, refunded: Math.max(0, r.refunded - payment.amount) } : r);
    setStore(log(next, "Deleted payment", payment.id, `${payment.party} · ${money(payment.amount)}`));
  }

  function removeVendor(vendor: Vendor) {
    if (store.purchases.some(p => p.vendorId === vendor.id) || store.returns.some(r => r.vendorId === vendor.id)) { notify("This supplier has purchase history. Keep the supplier so old invoices and returns remain traceable."); return; }
    if (!window.confirm(`Delete supplier ${vendor.name}?`)) return;
    setStore(current => log({ ...current, vendors: current.vendors.filter(v => v.id !== vendor.id) }, "Deleted supplier", vendor.name, "Supplier had no purchases"));
  }

  function exportCsv() {
    let rows: string[][] = [["Date", "Record", "Name", "Status", "Amount", "Reference"]];
    if (section === "Purchases") rows.push(...purchases.map(p => [p.date, "Purchase", p.vendorName, purchaseDue(store,p) ? "Balance due" : "Settled", String(purchaseTotal(p)), p.reference || p.id]));
    else if (section === "Sales" || section === "Reports") rows.push(...orders.filter(o=>o.status!=="Draft").map(o=>[o.created,"Sale",o.customer,o.status,String(saleTotal(o)),o.invoice||o.id]));
    else rows.push(...cashRows.map(p=>[p.date,p.kind,p.party,"Recorded",String(p.amount),p.reference]));
    const csv=rows.map(row=>row.map(value=>`"${value.replaceAll('"','""')}"`).join(",")).join("\n");
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));link.download=`d2-garments-${slug(section)}.csv`;link.click();URL.revokeObjectURL(link.href);notify(`${section} list exported to CSV.`);
  }

  function resetAll() {
    if (!window.confirm("Clear all suppliers, products, purchases, inventory, sales, returns, cash records and activity logs from this browser?")) return;
    localStorage.removeItem(STORE_KEY);localStorage.removeItem(PREVIOUS_KEY);setStore(EMPTY);setModal(null);setSection("Overview");notify("Workspace cleared. All operational records are empty.");
  }

  function actionButton(label: string, click: () => void, icon?: typeof Pencil, danger = false) { const Icon = icon; return <button className={`row-action ${danger?"row-danger":""}`} onClick={click}>{Icon&&<Icon size={15}/>}<span>{label}</span></button>; }
  function addAction() {
    if (section === "Vendors") showModal("vendor");
    else if (section === "Purchases") startPurchase();
    else if (section === "Sales") { if (available <= 0) { open("Purchases"); notify("Record a purchase to receive stock before creating a sales order."); } else showModal("order"); }
    else if (section === "Cash flow") { if (totalDue > 0) showModal("supplier-payment"); else if (totalReceivable > 0) showModal("customer-payment"); else notify("There are no balances to pay or collect yet."); }
    else if (section === "Profile") open("Profile"); else startPurchase();
  }
  const actionLabel = section === "Vendors" ? "Add supplier" : section === "Purchases" ? "New purchase" : section === "Sales" ? "New sales order" : section === "Cash flow" ? "Record payment" : section === "Profile" ? "Edit profile" : "New purchase";

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="sidebar-top"><div className="brand"><div className="brand-mark"><span/><span/><span/><span/></div><div className="brand-name">d2<span>garments</span><small>OPERATIONS</small></div></div><button className="icon-button mobile-close" aria-label="Close menu" onClick={()=>setMobileNav(false)}><X size={20}/></button></div>
      <div className="workspace"><div className="workspace-avatar">D2</div><div className="workspace-label"><strong>{store.profile.name}</strong><span>Workspace</span></div><span className="demo-badge">DEMO</span></div>
      <div className="nav-label">WORKSPACE</div><nav className="nav-list">{sections.map(({name,icon:Icon})=><button key={name} className={`nav-item ${section===name?"active":""}`} onClick={()=>open(name)}><Icon size={19}/><span>{name}</span>{name==="Inventory"&&<span className="nav-count">{store.batches.length}</span>}{name==="Sales"&&store.orders.some(o=>o.status==="Draft")&&<span className="nav-count attention">{store.orders.filter(o=>o.status==="Draft").length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item settings" onClick={()=>showModal("reset")}><Trash2 size={18}/><span>Reset workspace</span></button><div className="user-card"><div className="user-avatar">{store.profile.name.slice(0,1)||"D"}</div><div className="user-name"><strong>{store.profile.name}</strong><span>Admin workspace</span></div></div></div>
    </aside>
    {mobileNav&&<button className="nav-scrim" onClick={()=>setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" aria-label="Open menu" onClick={()=>setMobileNav(true)}><Menu size={21}/></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={16}/><strong>{section}</strong></div></div><div className="topbar-actions"><span className="header-avatar">{store.profile.name.slice(0,1)||"D"}</span></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase()}</div><h1>{title}</h1><p>{description[section]}</p></div><div className="heading-actions"><button className="button secondary" onClick={exportCsv}><Download size={17}/>Export</button><button className="button primary" onClick={addAction} disabled={section==="Reports"||section==="Activity log"||section==="Inventory"}><Plus size={18}/>{actionLabel}</button></div></div>
        <div className="global-filters"><label className="filter-search"><Search size={18}/><input aria-label="Search records" placeholder={`Search ${section.toLowerCase()} by name, reference, product…`} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button onClick={()=>setSearch("")} aria-label="Clear search"><X size={16}/></button>}</label><label className="date-filter"><span>From</span><input aria-label="Start date" type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label><label className="date-filter"><span>To</span><input aria-label="End date" type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label><button className="clear-filters" onClick={()=>{setSearch("");setFrom("");setTo("")}}>Clear filters</button></div>
        {message&&<div className="notice" role="status"><span><Check size={18}/>{message}</span><button onClick={()=>setMessage("")} aria-label="Dismiss notification"><X size={17}/></button></div>}
        {!ready?<div className="loading-state">Loading your workspace…</div>:<>
          {section==="Overview"&&<>
            <div className="workflow-banner"><div className="workflow-copy"><span className="workflow-icon"><ClipboardList size={22}/></span><div><strong>Move each order through to payment</strong><p>Purchases add traceable stock. Sales consume the oldest lots, invoices track what customers owe, and recorded payments update cash flow.</p></div></div><button className="workflow-action" onClick={startPurchase}><Plus size={17}/>Start with a purchase</button></div>
            <div className="stat-grid"><article className="stat-card"><div className="stat-top"><span className="stat-icon icon-stock"><Boxes size={20}/></span><span className="stat-period">Stock on hand</span></div><div className="stat-value">{available.toLocaleString("en-IN")} <small>units</small></div><div className="stat-foot">{store.batches.filter(b=>inRange(b.received)).length} lots in selected dates</div></article><article className="stat-card"><div className="stat-top"><span className="stat-icon icon-revenue"><CircleDollarSign size={20}/></span><span className="stat-period">Confirmed sales</span></div><div className="stat-value">{money(saleValue)}</div><div className="stat-foot">{store.orders.filter(o=>o.status!=="Draft"&&inRange(o.created)).length} orders in selected dates</div></article><article className="stat-card"><div className="stat-top"><span className="stat-icon icon-expense"><ArrowDownRight size={20}/></span><span className="stat-period">Supplier balance due</span></div><div className="stat-value">{money(totalDue)}</div><div className="stat-foot">Refunds owed to you: {money(totalRefundDue)}</div></article><article className="stat-card"><div className="stat-top"><span className="stat-icon icon-profit"><Activity size={20}/></span><span className="stat-period">Gross profit</span></div><div className="stat-value">{money(taxableSales-saleCogs)}</div><div className="stat-foot">Sales before tax minus FIFO product cost</div></article></div>
            <div className="content-grid"><section className="panel overview-panel"><div className="panel-heading"><div><h2>Inventory and order status</h2><p>Live totals from the records you enter.</p></div><button className="text-action" onClick={()=>open("Inventory")}>Inventory details <ArrowRight size={16}/></button></div>{store.batches.length===0?<EmptyState icon={Boxes} title="Inventory is empty" text="Record a purchase to receive your first stock lots." action="Add first purchase" onAction={startPurchase}/>:<div className="overview-inventory"><div className="mini-total"><span>Stock on hand</span><strong>{available.toLocaleString("en-IN")} units</strong></div><div className="mini-total"><span>Inventory value at cost</span><strong>{money(inventoryValue)}</strong></div><div className="mini-total"><span>Orders waiting for confirmation</span><strong>{store.orders.filter(o=>o.status==="Draft").length}</strong></div><button className="button secondary" onClick={()=>{open("Sales");showModal("order")}}><Plus size={16}/>Create order from stock</button></div>}</section><section className="panel cash-panel"><div className="panel-heading"><div><h2>Cash position</h2><p>Recorded payments in this date range</p></div><button className="text-action" onClick={()=>open("Cash flow")}>Open ledger <ArrowRight size={16}/></button></div><div className="cash-balance"><div className="cash-icon"><Wallet size={21}/></div><div><span>Net cash movement</span><strong>{money(cashIn-cashOut)}</strong></div></div><div className="cash-flow-row"><div><span><i className="flow-dot in-dot"/>Money received</span><strong>{money(cashIn)}</strong></div><div><span><i className="flow-dot out-dot"/>Money paid</span><strong>{money(cashOut)}</strong></div></div><div className="cash-divider"/><button className="payable-row clickable-row" onClick={()=>open("Purchases")}><span className="payable-copy"><strong>Supplier balance</strong><span>{store.purchases.length} purchase records</span></span><span className="payable-amount">{money(totalDue)}<ArrowRight size={16}/></span></button></section></div>
          </>}
          {section==="Inventory"&&<section className="panel data-panel"><div className="panel-heading"><div><h2>Inventory lots</h2><p>Each lot is tied to its supplier and original purchase. Returns reduce only the selected lot.</p></div><button className={`filter-button ${lowOnly?"filter-active":""}`} onClick={()=>setLowOnly(v=>!v)}>{lowOnly?"Showing low stock · Show all":"Low stock filter"}</button></div><Table><thead><tr><th>PRODUCT / LOT</th><th>SUPPLIER</th><th>RECEIVED</th><th>IN</th><th>ON HAND</th><th>MATERIAL</th><th>MAKE</th><th>UNIT COST</th><th>ACTION</th></tr></thead><tbody>{batches.map(batch=><tr key={batch.id}><td><span className="cell-main">{batch.product}</span><span className="cell-sub">{batch.sku||batch.id} · {batch.category}</span></td><td>{batch.vendorName}</td><td>{dateText(batch.received)}</td><td>{batch.quantity}</td><td><strong>{batch.remaining}</strong></td><td>{money(batch.materialCost)}</td><td>{money(batch.manufacturingCost)}</td><td>{money(batch.materialCost+batch.manufacturingCost)}</td><td>{actionButton("Edit purchase",()=>{open("Purchases");showModal("purchase",batch.purchaseId)},Pencil)}</td></tr>)}</tbody></Table>{batches.length===0&&<EmptyState icon={Boxes} title="No stock lots found" text="Record a purchase or adjust the search and date range." action="Record purchase" onAction={startPurchase}/>}</section>}
          {section==="Vendors"&&<section className="panel data-panel"><div className="panel-heading"><div><h2>Supplier directory &amp; product catalogs</h2><p>Create each supplier once, then keep their products under that supplier.</p></div><button className="button primary" onClick={()=>showModal("vendor")}><Plus size={17}/>Add supplier</button></div>{vendors.length===0?<EmptyState icon={Package} title="No suppliers yet" text="Create a supplier profile once. You can add any number of products under their catalog." action="Create supplier" onAction={()=>showModal("vendor")}/>:<div className="vendor-grid">{vendors.map(vendor=><article className="vendor-card" key={vendor.id}><div className="vendor-card-head"><span className="vendor-avatar">{vendor.name.slice(0,1).toUpperCase()}</span><div><strong>{vendor.name}</strong><small>{vendor.phone||vendor.email||"Supplier"}</small></div><div className="row-actions">{actionButton("Edit",()=>showModal("vendor",vendor.id),Pencil)}{actionButton("Delete",()=>removeVendor(vendor),Trash2,true)}</div></div><div className="vendor-meta"><span>{vendor.email||"No email added"}</span><span>{vendor.address||"No address added"}</span></div><div className="catalog-title"><strong>Products from {vendor.name}</strong><button className="table-action" onClick={()=>{setEditId(vendor.id);setVendorContext("");setModal("product")}}><Plus size={15}/>Add product</button></div>{vendor.products.length===0?<p className="vendor-empty">No catalog items yet. Products can also be added while recording a purchase.</p>:<div className="catalog-list">{vendor.products.map(product=><div className="catalog-row" key={product.id}><span><strong>{product.name}</strong><small>{product.sku||"No SKU"} · {product.category}</small></span><span className="row-actions">{actionButton("Edit",()=>{setEditId(vendor.id);setVendorContext(product.id);setModal("product")},Pencil)}{actionButton("Delete",()=>{if(store.purchases.some(p=>p.vendorId===vendor.id&&p.items.some(i=>i.productId===product.id))){notify("This product has purchase history. Edit or return the original purchase instead.");return}setStore(current=>log({...current,vendors:current.vendors.map(v=>v.id===vendor.id?{...v,products:v.products.filter(p=>p.id!==product.id)}:v)},"Deleted supplier product",`${vendor.name} / ${product.name}`,product.sku))},Trash2,true)}</span></div>)}</div>}</article>)}</div>}</section>}
          {section==="Purchases"&&<section className="panel data-panel"><div className="panel-heading"><div><h2>Purchases &amp; supplier balances</h2><p>One supplier per purchase, multiple product lines. Returns and payments stay attached to the original source.</p></div><div className="heading-actions"><button className="button secondary" onClick={()=>{setContinueToPurchase(true);setSection("Vendors");showModal("vendor")}}><Plus size={16}/>Add supplier</button><button className="button primary" onClick={startPurchase}><Plus size={16}/>New purchase</button></div></div><Table><thead><tr><th>PURCHASE / SUPPLIER</th><th>PRODUCTS</th><th>DATE</th><th>VALUE</th><th>PAID</th><th>RETURNS</th><th>BALANCE / REFUND DUE</th><th>ACTIONS</th></tr></thead><tbody>{purchases.map(purchase=><tr key={purchase.id}><td><span className="cell-main">{purchase.vendorName}</span><span className="cell-sub">{purchase.id}{purchase.reference?` · ${purchase.reference}`:""}</span></td><td>{purchase.items.map(item=><span className="tag-line" key={item.id}>{item.name} × {item.quantity}</span>)}</td><td>{dateText(purchase.date)}</td><td>{money(purchaseTotal(purchase))}</td><td>{money(purchase.paid)}</td><td>{money(returnedTotal(store,purchase.id))}</td><td>{refundDue(store,purchase.id)>0?<span className="due-cell">Refund {money(refundDue(store,purchase.id))}</span>:<strong>{money(purchaseDue(store,purchase))}</strong>}</td><td><div className="row-actions">{actionButton("Edit",()=>showModal("purchase",purchase.id),Pencil)}{actionButton("Return",()=>showModal("purchase-return",purchase.id),ArrowDownLeft)}{actionButton("Delete",()=>deletePurchase(purchase),Trash2,true)}{purchaseDue(store,purchase)>0&&actionButton("Pay",()=>showModal("supplier-payment",purchase.id),Wallet)}</div></td></tr>)}</tbody></Table>{purchases.length===0&&<EmptyState icon={ClipboardList} title="No purchases found" text="Add a supplier and receive multiple products in one purchase. The product catalog updates under that supplier." action="Record purchase" onAction={startPurchase}/>}<div className="subsection-heading"><h3>Purchase returns</h3><span>Always linked to the original vendor and product lot</span></div><Table><thead><tr><th>RETURN</th><th>SUPPLIER</th><th>PRODUCT</th><th>DATE</th><th>QUANTITY</th><th>VALUE</th><th>SETTLEMENT</th><th>ACTION</th></tr></thead><tbody>{store.returns.filter(r=>inRange(r.date)&&queryMatches(`${r.id} ${r.vendorName} ${r.product} ${r.reason}`)).map(r=><tr key={r.id}><td>{r.id}<span className="cell-sub">{r.purchaseId}</span></td><td>{r.vendorName}</td><td>{r.product}</td><td>{dateText(r.date)}</td><td>{r.quantity}</td><td>{money(r.amount)}</td><td><span className={`status-pill ${r.refunded>=r.amount?"paid":"due"}`}>{r.disposition}{r.disposition==="Refund due"?` · ${money(r.amount-r.refunded)} open`:""}</span></td><td><div className="row-actions">{actionButton("Edit",()=>{setEditId(r.purchaseId);setEditReturnId(r.id);setModal("purchase-return")},Pencil)}{actionButton("Delete",()=>deleteReturn(r),Trash2,true)}{r.disposition==="Refund due"&&r.refunded<r.amount?actionButton("Record refund",()=>showModal("supplier-refund",r.id),Wallet):null}</div></td></tr>)}</tbody></Table></section>}
          {section==="Sales"&&<section className="panel data-panel"><div className="panel-heading"><div><h2>Sales &amp; invoices</h2><p>Draft → Confirm order (deduct FIFO lots) → Generate invoice → Record payment.</p></div><button className="button primary" onClick={()=>showModal("order")} disabled={available===0}><Plus size={17}/>New sales order</button></div><div className="order-flow-note"><span>Draft order</span><ChevronRight size={16}/><span>Confirm &amp; deduct stock</span><ChevronRight size={16}/><span>Generate invoice</span><ChevronRight size={16}/><span>Record payment</span></div><Table><thead><tr><th>ORDER / CUSTOMER</th><th>PRODUCTS</th><th>TYPE</th><th>DATE</th><th>ORDER TOTAL</th><th>PAID / DUE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td><span className="cell-main">{order.customer}</span><span className="cell-sub">{order.invoice||order.id}</span></td><td>{order.items.map(item=><span className="tag-line" key={item.id}>{item.product} × {item.quantity}</span>)}</td><td>{order.channel}</td><td>{dateText(order.created)}</td><td>{money(saleTotal(order))}</td><td>{money(order.paid)} / {money(Math.max(0,saleTotal(order)-order.paid))}</td><td><span className={`status-pill ${order.status.toLowerCase()}`}>{order.status}</span></td><td><div className="row-actions">{order.status==="Draft"?actionButton("Confirm",()=>confirmOrder(order),Check):order.status==="Confirmed"?actionButton("Invoice",()=>createInvoice(order),FileText):<>{actionButton("Invoice",()=>{setEditId(order.id);setModal("invoice")},FileText)}{order.status!=="Paid"&&actionButton("Receive",()=>showModal("customer-payment",order.id),Wallet)}</>}{actionButton("Edit",()=>showModal("order",order.id),Pencil)}{actionButton("Delete",()=>deleteOrder(order),Trash2,true)}</div></td></tr>)}</tbody></Table>{orders.length===0&&<EmptyState icon={ShoppingBag} title="No sales orders found" text={available>0?"Create an order using stock already in inventory.":"Record a purchase first. Items received into stock will be available in the sales order form."} action={available>0?"Create order":undefined} onAction={()=>showModal("order")}/>}</section>}
          {section==="Cash flow"&&<section className="panel data-panel"><div className="panel-heading"><div><h2>Cash ledger &amp; open balances</h2><p>Payments and refunds affect cash only when you record the transaction.</p></div><div className="heading-actions"><button className="button secondary" onClick={()=>showModal("supplier-payment")} disabled={store.purchases.every(p=>purchaseDue(store,p)===0)}>Pay supplier</button><button className="button primary" onClick={()=>showModal("customer-payment")} disabled={store.orders.every(o=>o.status!=="Invoiced"||saleTotal(o)<=o.paid)}><Plus size={17}/>Receive money</button></div></div><div className="ledger-summary"><div><span>Customer receipts</span><strong className="positive-amount">{money(cashIn)}</strong></div><div><span>Supplier payments</span><strong className="negative-amount">{money(cashOut)}</strong></div><div><span>Supplier balances due</span><strong>{money(totalDue)}</strong></div><div><span>Customer balances due</span><strong>{money(totalReceivable)}</strong></div></div><Table><thead><tr><th>DATE</th><th>TYPE</th><th>PARTY</th><th>REFERENCE</th><th>METHOD</th><th>AMOUNT</th><th>ACTIONS</th></tr></thead><tbody>{cashRows.map(payment=><tr key={payment.id}><td>{dateText(payment.date)}</td><td>{payment.kind}</td><td>{payment.party}</td><td>{payment.reference}</td><td>{payment.method}</td><td className={payment.kind==="Supplier payment"?"negative-amount":"positive-amount"}>{payment.kind==="Supplier payment"?"−":"+"}{money(payment.amount)}</td><td><div className="row-actions">{actionButton("Edit",()=>showModal("edit-payment",payment.id),Pencil)}{actionButton("Delete",()=>deletePayment(payment),Trash2,true)}</div></td></tr>)}</tbody></Table>{cashRows.length===0&&<EmptyState icon={Wallet} title="No cash movements found" text="Record a supplier payment or customer receipt to create your first cash ledger entry."/>}</section>}
          {section==="Reports"&&<section className="panel data-panel"><div className="panel-heading"><div><h2>Purchases, sales &amp; profitability</h2><p>Dates and search filters above apply to each report table and totals.</p></div><button className="button secondary" onClick={exportCsv}><Download size={17}/>Download filtered CSV</button></div><div className="ledger-summary report-summary"><div><span>Purchase value</span><strong>{money(purchases.reduce((sum,p)=>sum+purchaseTotal(p),0))}</strong></div><div><span>Invoiced total including tax</span><strong>{money(orders.filter(o=>o.status!=="Draft").reduce((sum,o)=>sum+saleTotal(o),0))}</strong></div><div><span>FIFO cost + manufacturing</span><strong>{money(orders.filter(o=>o.status!=="Draft").reduce((sum,o)=>sum+saleCost(o),0))}</strong></div><div><span>Gross profit before tax</span><strong>{money(orders.filter(o=>o.status!=="Draft").reduce((sum,o)=>sum+saleSubtotal(o)-saleCost(o),0))}</strong></div></div><h3>Sales margin by order</h3><Table><thead><tr><th>DATE</th><th>INVOICE / ORDER</th><th>CUSTOMER</th><th>PRODUCTS</th><th>SALES</th><th>FIFO COST</th><th>GROSS PROFIT</th></tr></thead><tbody>{orders.filter(o=>o.status!=="Draft").map(order=><tr key={order.id}><td>{dateText(order.created)}</td><td>{order.invoice||order.id}</td><td>{order.customer}</td><td>{order.items.map(item=>`${item.product} × ${item.quantity}`).join(", ")}</td><td>{money(saleTotal(order))}</td><td>{money(saleCost(order))}</td><td className={saleSubtotal(order)>=saleCost(order)?"positive-amount":"negative-amount"}>{money(saleSubtotal(order)-saleCost(order))}</td></tr>)}</tbody></Table>{orders.filter(o=>o.status!=="Draft").length===0&&<EmptyState icon={FileChartColumn} title="No confirmed orders in this range" text="Confirmed orders will appear with the cost of stock consumed from each vendor lot."/>}<h3>Purchases by supplier</h3><Table><thead><tr><th>DATE</th><th>SUPPLIER</th><th>PRODUCTS</th><th>PURCHASE VALUE</th><th>PAID</th><th>DUE</th></tr></thead><tbody>{purchases.map(p=><tr key={p.id}><td>{dateText(p.date)}</td><td>{p.vendorName}</td><td>{p.items.map(item=>`${item.name} × ${item.quantity}`).join(", ")}</td><td>{money(purchaseTotal(p))}</td><td>{money(p.paid)}</td><td>{money(purchaseDue(store,p))}</td></tr>)}</tbody></Table></section>}
          {section==="Activity log"&&<section className="panel data-panel"><div className="panel-heading"><div><h2>Activity history</h2><p>Every new record, edit, deletion, invoice, payment, and return is timestamped here.</p></div><span className="soft-badge">{logs.length} changes</span></div><Table><thead><tr><th>DATE &amp; TIME</th><th>USER</th><th>ACTION</th><th>RECORD</th><th>DETAILS</th></tr></thead><tbody>{logs.map(item=><tr key={item.id}><td>{new Date(item.dateTime).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}</td><td>{item.actor}</td><td><strong>{item.action}</strong></td><td>{item.record}</td><td>{item.detail||"—"}</td></tr>)}</tbody></Table>{logs.length===0&&<EmptyState icon={Activity} title="No activity recorded yet" text="Actions such as creating a supplier, purchase, sale, return or payment will be logged with the exact time."/>}</section>}
          {section==="Profile"&&<section className="panel profile-panel"><div className="panel-heading"><div><h2>Invoice From details</h2><p>These business, contact and bank details appear on generated invoices.</p></div></div><form onSubmit={saveProfile}><div className="profile-grid"><label>Business / company name<input name="name" required defaultValue={store.profile.name}/></label><label>Business email<input name="email" type="email" defaultValue={store.profile.email}/></label><label>Contact number<input name="phone" defaultValue={store.profile.phone}/></label><label>GSTIN<input name="gstin" defaultValue={store.profile.gstin}/></label><label className="wide-field">Business address<textarea name="address" rows={3} defaultValue={store.profile.address}/></label><label>Bank name<input name="bank" defaultValue={store.profile.bank}/></label><label>Account holder name<input name="accountName" defaultValue={store.profile.accountName}/></label><label>Account number<input name="accountNumber" defaultValue={store.profile.accountNumber}/></label><label>IFSC code<input name="ifsc" defaultValue={store.profile.ifsc}/></label></div><div className="profile-actions"><span>Invoice From: <strong>{store.profile.name}</strong> · To: the order customer</span><button className="button primary" type="submit"><Check size={17}/>Save profile</button></div></form></section>}
        </>}
        <footer className="page-footer"><span><Activity size={15}/>{store.profile.name} · Operations workspace</span><span>Search and date filters apply to this section <i>·</i><button onClick={()=>showModal("reset")}>Reset workspace</button></span></footer>
      </div>
    </main>
    {modal&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setModal(null)}}>
      {modal==="invoice"&&selectedOrder&&<InvoiceModal order={selectedOrder} profile={store.profile} payments={store.payments.filter(p=>p.kind==="Customer receipt"&&p.linkId===selectedOrder.id)} onClose={()=>setModal(null)} onPrint={()=>window.print()} onReceive={()=>showModal("customer-payment",selectedOrder.id)}/>}
      {modal==="reset"&&<div className="modal reset-modal"><div className="modal-head"><span className="modal-symbol"><Settings2 size={20}/></span><button className="icon-button" onClick={()=>setModal(null)} aria-label="Close"><X size={19}/></button></div><h2>Reset workspace?</h2><p>This removes suppliers, vendor products, purchases, stock, orders, returns, cash transactions and logs from this browser.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setModal(null)}>Cancel</button><button className="button danger" onClick={resetAll}>Clear workspace</button></div></div>}
      {modal==="vendor"&&<ModalForm title={store.vendors.find(v=>v.id===editId)?"Edit supplier":"Add supplier"} description="Create this supplier once. Reuse their profile and catalog for every purchase." onClose={()=>setModal(null)} onSubmit={submit} submitLabel="Save supplier"><VendorFields vendor={store.vendors.find(v=>v.id===editId)}/></ModalForm>}
      {modal==="product"&&<ModalForm title={vendorContext?"Edit supplier product":"Add product to supplier catalog"} description={`Product identity is unique within ${store.vendors.find(v=>v.id===editId)?.name??"this supplier"}. The same garment from another supplier stays linked to that other supplier’s lots.`} onClose={()=>setModal(null)} onSubmit={submit} submitLabel="Save product"><ProductFields product={store.vendors.find(v=>v.id===editId)?.products.find(p=>p.id===vendorContext)}/></ModalForm>}
      {modal==="purchase"&&<ModalForm title={store.purchases.find(p=>p.id===editId)?"Edit purchase":"New supplier purchase"} description="Choose a saved supplier and add as many product lines as needed. Each line creates its own lot and vendor-linked product." onClose={()=>setModal(null)} onSubmit={submit} submitLabel={editId?"Save purchase":"Confirm purchase & receive stock"} wide><PurchaseFields vendors={store.vendors} purchase={store.purchases.find(p=>p.id===editId)} count={lineCount} setCount={setLineCount} batches={store.batches}/></ModalForm>}
      {modal==="purchase-return"&&<ModalForm title={editReturnId?"Edit purchase return":"Return items to supplier"} description="Select an unallocated quantity from the original purchase. The correct vendor and source lot remain attached to this return." onClose={()=>setModal(null)} onSubmit={submit} submitLabel={editReturnId?"Save return changes":"Record return"}><ReturnFields purchase={store.purchases.find(p=>p.id===editId)} batches={store.batches} returned={store.returns.find(r=>r.id===editReturnId)}/></ModalForm>}
      {modal==="order"&&<ModalForm title={selectedOrder?"Edit sales order":"Create sales order"} description="A draft does not consume stock. Confirm the order to reserve the oldest available stock lots." onClose={()=>setModal(null)} onSubmit={submit} submitLabel="Save draft order" wide><OrderFields vendors={store.vendors} batches={store.batches} count={lineCount} setCount={setLineCount} order={selectedOrder}/></ModalForm>}
      {(modal==="supplier-payment"||modal==="customer-payment"||modal==="supplier-refund"||modal==="edit-payment")&&<ModalForm title={modal==="supplier-payment"?"Pay supplier":modal==="customer-payment"?"Receive customer payment":modal==="supplier-refund"?"Record supplier refund":"Edit cash transaction"} description="The selected amount must stay within the open balance. The related account and cash ledger update together." onClose={()=>setModal(null)} onSubmit={submit} submitLabel={modal==="edit-payment"?"Save payment changes":"Record payment"}><PaymentFields mode={modal} store={store} target={editId||refundReturnId} payment={store.payments.find(p=>p.id===editId)}/></ModalForm>}
    </div>}
    <style jsx global>{`@media print{body *{visibility:hidden!important}.invoice-modal,.invoice-modal *{visibility:visible!important}.invoice-modal{position:fixed!important;inset:0!important;width:100%!important;max-width:100%!important;box-shadow:none!important;border:0!important}.invoice-modal .modal-actions,.invoice-modal .icon-button{display:none!important}}`}</style>
  </div>;
}

function batchesFor(store:Store, productId?:string) { return store.batches.filter(batch=>!productId||batch.productId===productId); }
function Table({children}:{children:React.ReactNode}) { return <div className="table-wrap"><table>{children}</table></div>; }
function ModalForm({title,description,onClose,onSubmit,submitLabel,wide,children}:{title:string;description:string;onClose:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;submitLabel:string;wide?:boolean;children:React.ReactNode}) { return <form className={`modal ${wide?"modal-wide":""}`} onSubmit={onSubmit}><div className="modal-head"><span className="modal-symbol"><ClipboardList size={20}/></span><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19}/></button></div><h2>{title}</h2><p>{description}</p><div className="modal-body">{children}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary"><Check size={17}/>{submitLabel}</button></div></form>; }
function VendorFields({vendor}:{vendor?:Vendor}) { return <><label>Supplier name<input name="name" required defaultValue={vendor?.name} placeholder="Supplier or manufacturer"/></label><div className="form-row"><label>Contact number<input name="phone" defaultValue={vendor?.phone} placeholder="Phone"/></label><label>Email address<input name="email" type="email" defaultValue={vendor?.email} placeholder="Email"/></label></div><label>Address<textarea name="address" rows={2} defaultValue={vendor?.address} placeholder="Business address"/></label><div className="form-row"><label>Bank name<input name="bank" defaultValue={vendor?.bank}/></label><label>Account holder<input name="accountName" defaultValue={vendor?.accountName}/></label></div><div className="form-row"><label>Account number<input name="accountNumber" defaultValue={vendor?.accountNumber}/></label><label>IFSC code<input name="ifsc" defaultValue={vendor?.ifsc}/></label></div></>; }
function ProductFields({product}:{product?:VendorProduct}) { return <><label>Product name<input name="name" required defaultValue={product?.name} placeholder="e.g. Cotton saree"/></label><div className="form-row"><label>Product code / SKU<input name="sku" defaultValue={product?.sku} placeholder="Optional code"/></label><label>Category<select name="category" defaultValue={product?.category??"Sarees"}><option>Sarees</option><option>Salwar suits</option><option>Kurtis</option><option>Blouses</option><option>T-shirts</option><option>Shirts</option><option>Bottoms</option><option>Other</option></select></label></div></>; }
function PurchaseFields({vendors,purchase,count,setCount,batches}:{vendors:Vendor[];purchase?:Purchase;count:number;setCount:(n:number)=>void;batches:Batch[]}) { const items=purchase?.items??[]; return <><div className="form-row"><label>Supplier<select name="vendorId" required defaultValue={purchase?.vendorId??""}><option value="">Choose saved supplier</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>Purchase date<input name="date" type="date" required defaultValue={purchase?.date??isoDate()}/></label></div>{vendors.length===0&&<div className="inline-hint">Create a supplier profile in the Vendors tab first so the product catalog is linked correctly.</div>}<label>Supplier reference / invoice<input name="reference" defaultValue={purchase?.reference} placeholder="Invoice or delivery reference"/></label><div className="line-editor-head"><strong>Products in this purchase</strong><button type="button" className="table-action" onClick={()=>setCount(count+1)}><Plus size={15}/>Add product line</button></div>{Array.from({length:Math.max(1,count)}).map((_,index)=>{const item=items[index];return <div className="purchase-line-editor" key={item?.id??index}><div className="line-number">{index+1}</div><button type="button" className="line-remove" aria-label="Remove product line" onClick={()=>setCount(Math.max(1,count-1))}><X size={14}/></button><div className="purchase-line-grid"><label>Product name<input name={`product-${index}`} required={index===0} defaultValue={item?.name} list="vendor-product-list" placeholder="Product"/></label><label>SKU<input name={`sku-${index}`} defaultValue={item?.sku} placeholder="Optional"/></label><label>Quantity<input name={`quantity-${index}`} required={index===0} type="number" min="1" defaultValue={item?.quantity} placeholder="0"/></label><label>Material cost / unit<input name={`material-${index}`} required={index===0} type="number" min="0" step="0.01" defaultValue={item?.materialCost} placeholder="₹"/></label><label>Make cost / unit<input name={`making-${index}`} required={index===0} type="number" min="0" step="0.01" defaultValue={item?.manufacturingCost} placeholder="₹"/></label><label>Category<select name={`category-${index}`} defaultValue={item?.category??"Sarees"}><option>Sarees</option><option>Salwar suits</option><option>Kurtis</option><option>Blouses</option><option>T-shirts</option><option>Shirts</option><option>Other</option></select></label></div><datalist id="vendor-product-list">{vendors.flatMap(v=>v.products).map(product=><option key={product.id} value={product.name}/>)}</datalist></div>})}<div className="form-row"><label>Received into warehouse<select name="warehouse"><option>Warehouse A</option><option>Warehouse B</option><option>Storefront</option></select></label><label>Purchase settlement<input disabled value={purchase?`${money(purchase.paid)} paid`:"Unpaid · record payment in Cash flow"}/></label></div>{purchase&&<div className="inline-hint">Sold / returned quantities are protected when editing stock quantities. Use the Return action to record items sent back to this supplier.</div>}<div className="hidden-stock-check" aria-hidden="true">{batches.length}</div></>; }
function ReturnFields({purchase,batches,returned}:{purchase?:Purchase;batches:Batch[];returned?:PurchaseReturn}) {
  const available=(lineId:string)=>batches.filter(b=>b.purchaseId===purchase?.id&&b.lineId===lineId).reduce((s,b)=>s+b.remaining,0)+(returned?.lineId===lineId?returned.quantity:0);
  return <>{purchase&&<><label>Supplier<input readOnly value={purchase.vendorName}/></label><label>Product / original purchase<select name="lineId" required defaultValue={returned?.lineId??""}><option value="">Choose purchase line</option>{purchase.items.filter(i=>available(i.id)>0).map(item=><option key={item.id} value={item.id}>{item.name} · {item.sku||purchase.id} · {available(item.id)} units available</option>)}</select></label><div className="form-row"><label>Quantity to return<input name="quantity" type="number" required min="1" defaultValue={returned?.quantity} placeholder="Units"/></label><label>Return date<input name="date" type="date" defaultValue={returned?.date??isoDate()} required/></label></div><label>Settlement<select name="disposition" defaultValue={returned?.disposition??"Vendor credit"}><option>Vendor credit</option><option>Refund due</option></select></label><label>Reason<input name="reason" defaultValue={returned?.reason} placeholder="Optional return reason"/></label>{returned?.refunded&&<div className="inline-hint">Already refunded: {money(returned.refunded)}. The return value cannot be edited below this amount.</div>}</>}</>;
}
function OrderFields({vendors,batches,count,setCount,order}:{vendors:Vendor[];batches:Batch[];count:number;setCount:(n:number)=>void;order?:Order}) { const lines=order?.items??[];return <><div className="form-row"><label>Customer / buyer<input name="customer" required defaultValue={order?.customer} placeholder="Buyer or business name"/></label><label>Order type<select name="channel" defaultValue={order?.channel??"Retail"}>{orderTypes.map(type=><option key={type}>{type}</option>)}</select></label></div><label>Order date<input name="date" type="date" required defaultValue={order?.created??isoDate()}/></label><div className="line-editor-head"><strong>Order products</strong><button type="button" className="table-action" onClick={()=>setCount(count+1)}><Plus size={15}/>Add item</button></div>{Array.from({length:Math.max(1,count)}).map((_,index)=>{const line=lines[index];const products=vendors.flatMap(v=>v.products).filter(product=>batches.filter(b=>b.productId===product.id).reduce((s,b)=>s+b.remaining,0)>0||order?.status!=="Draft");return <div className="sale-line-editor" key={line?.id??index}><button type="button" className="line-remove" aria-label="Remove order line" onClick={()=>setCount(Math.max(1,count-1))}><X size={14}/></button><label>In-stock product<select name={`product-${index}`} required={index===0} defaultValue={line?.productId??""}><option value="">Choose product</option>{products.map(product=><option key={product.id} value={product.id}>{product.name} · {batches.filter(b=>b.productId===product.id).reduce((s,b)=>s+b.remaining,0)} available</option>)}</select></label><div className="form-row"><label>Quantity<input name={`quantity-${index}`} type="number" required={index===0} min="1" defaultValue={line?.quantity} placeholder="0"/></label><label>Price per unit (₹)<input name={`price-${index}`} type="number" required={index===0} min="0.01" step="0.01" defaultValue={line?.price} placeholder="0.00"/></label><label>Tax rate (%)<input name={`tax-${index}`} type="number" min="0" max="100" step="0.01" defaultValue={line?.taxRate??0}/></label></div></div>})}{order&&order.status!=="Draft"&&<div className="inline-hint">This order has been confirmed. Editing changes its order details; stock will be recalculated and reallocated FIFO.</div>}</>; }
function PaymentFields({mode,store,target,payment}:{mode:Modal;store:Store;target:string;payment?:Payment}) {
  const kind=payment?.kind??(mode==="supplier-payment"?"Supplier payment":mode==="supplier-refund"?"Supplier refund":"Customer receipt");
  let options:{id:string;label:string;due:number}[]=[];
  if(kind==="Supplier payment") options=store.purchases.filter(p=>purchaseDue(store,p)>0).map(p=>({id:p.id,label:`${p.vendorName} · ${p.id}`,due:purchaseDue(store,p)}));
  if(kind==="Customer receipt") options=store.orders.filter(o=>o.invoice&&saleTotal(o)>o.paid).map(o=>({id:o.id,label:`${o.customer} · ${o.invoice}`,due:saleTotal(o)-o.paid}));
  if(kind==="Supplier refund") options=store.returns.filter(r=>r.amount>r.refunded).map(r=>({id:r.id,label:`${r.vendorName} · ${r.product} · ${r.id}`,due:r.amount-r.refunded}));
  return <><label>{kind==="Supplier payment"?"Purchase / supplier":kind==="Supplier refund"?"Returned purchase":"Invoiced customer order"}<select name="target" required defaultValue={payment?.linkId??target??""}><option value="">Select open balance</option>{options.map(option=><option value={option.id} key={option.id}>{option.label} · due {money(option.due)}</option>)}</select></label><div className="form-row"><label>Amount (₹)<input name="amount" type="number" required min="0.01" step="0.01" defaultValue={payment?.amount} placeholder="0.00"/></label><label>Payment method<select name="method" defaultValue={payment?.method??"Bank transfer"}><option>Bank transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option></select></label></div><div className="form-row"><label>Transaction date<input name="date" type="date" required defaultValue={payment?.date??isoDate()}/></label><label>Reference<input name="reference" defaultValue={payment?.reference} placeholder="Transaction reference"/></label></div></>;
}
function InvoiceModal({order,profile,payments,onClose,onPrint,onReceive}:{order:Order;profile:Profile;payments:Payment[];onClose:()=>void;onPrint:()=>void;onReceive:()=>void}) {return <div className="modal invoice-modal"><div className="invoice-top"><div><span className="invoice-brand">{profile.name.toUpperCase()}</span><span className="invoice-label">SALES INVOICE</span></div><button className="icon-button" onClick={onClose} aria-label="Close invoice"><X size={20}/></button></div><div className="invoice-parties"><div><span>FROM</span><strong>{profile.name}</strong><small>{profile.address||"Business address not set"}</small><small>{profile.email||"Email not set"} · {profile.phone||"Phone not set"}</small><small>{profile.gstin?`GSTIN ${profile.gstin}`:"GSTIN not set"}</small></div><div><span>TO</span><strong>{order.customer}</strong><small>{order.channel} · Order {order.id}</small></div></div><div className="invoice-number"><div><span>INVOICE NUMBER</span><strong>{order.invoice||"Invoice pending"}</strong></div><div><span>INVOICE DATE</span><strong>{dateText(isoDate())}</strong></div></div><table className="invoice-table"><thead><tr><th>PRODUCT</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead><tbody>{order.items.map(item=><tr key={item.id}><td>{item.product}</td><td>{item.quantity}</td><td>{money(item.price)}</td><td>{money(item.quantity*item.price)}</td></tr>)}</tbody></table><div className="invoice-totals"><span>Subtotal <strong>{money(saleSubtotal(order))}</strong></span><span>Tax <strong>{money(saleTotal(order)-saleSubtotal(order))}</strong></span><span className="invoice-grand">Invoice total <strong>{money(saleTotal(order))}</strong></span><span>Paid <strong>{money(order.paid)}</strong></span><span>Balance due <strong>{money(Math.max(0,saleTotal(order)-order.paid))}</strong></span></div><div className="invoice-bank"><strong>Bank details</strong><span>{profile.bank||"Bank not set"} · {profile.accountName||profile.name}</span><span>Account {profile.accountNumber||"not set"} · IFSC {profile.ifsc||"not set"}</span></div>{payments.length>0&&<div className="invoice-bank"><strong>Payment history</strong>{payments.map(item=><span key={item.id}>{dateText(item.date)} · {item.method} · {money(item.amount)} · {item.reference}</span>)}</div>}<div className="modal-actions"><button className="button secondary" onClick={onPrint}><Printer size={17}/>Print invoice</button>{saleTotal(order)>order.paid&&<button className="button primary" onClick={onReceive}><Plus size={17}/>Record payment</button>}</div></div>; }
