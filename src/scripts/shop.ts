/**
 * Storefront runtime for the premium-commerce plugin.
 *
 * - cart in localStorage (`ec-cart`), rendered into [data-cart] and counted
 *   into [data-cart-count] markers (usable in page-builder sections)
 * - [data-add-to-cart="<slug>"] buttons anywhere (static pages or sections)
 * - live availability for [data-availability="<productId>"] labels
 * - checkout: POST /checkout → hosted checkout of the configured provider (Stripe/Polar) or pay-later → success page
 *   confirms via /confirm or /order and renders the receipt into [data-order]
 *
 * The CMS is same-origin on the live domain; off-domain previews
 * (github.io, localhost) use CMS_URL from src/config.ts.
 */

import { CMS_URL } from "../config";

// The platform serves this frontend on the site's own domain(s) (the
// worker proxies the Pages build), so the CMS is same-origin everywhere
// except off-domain previews (github.io, localhost) which use CMS_URL.
const offDomain = typeof location !== "undefined" && /(^|\.)github\.io$|^localhost$|^127\.|^0\.0\.0\.0$/.test(location.hostname);
const API = offDomain ? CMS_URL : "";
const BASE = `${API}/_emdash/api/plugins/premium-commerce`;
const CART_KEY = "ec-cart";

interface CartLine {
	productId: string;
	slug: string;
	title: string;
	price: number;
	quantity: number;
}

interface Catalog {
	currency: string;
	manualPayment: boolean;
	/** An online provider (Stripe or Polar) is configured. */
	online?: boolean;
	provider?: string;
	/** Legacy alias of `online`. */
	stripe: boolean;
	products: Array<{ id: string; slug: string; title: string; unitAmount: number; available: number | null }>;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let currency = "usd";
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
function money(minor: number): string {
	const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
	try {
		return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(minor / factor);
	} catch {
		return `${(minor / factor).toFixed(2)} ${currency.toUpperCase()}`;
	}
}
function toMinor(price: number): number {
	return Math.round(price * (ZERO_DECIMAL.has(currency) ? 1 : 100));
}

/* ---- cart state ---------------------------------------------------------- */

export function readCart(): CartLine[] {
	try {
		const raw = localStorage.getItem(CART_KEY);
		const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
		return Array.isArray(parsed) ? parsed.filter((l) => l && l.productId && l.quantity > 0) : [];
	} catch {
		return [];
	}
}

function writeCart(lines: CartLine[]): void {
	try {
		localStorage.setItem(CART_KEY, JSON.stringify(lines));
	} catch {
		/* private mode */
	}
	renderCount();
	document.dispatchEvent(new CustomEvent("ec-cart:change", { detail: { lines } }));
}

export function addToCart(line: Omit<CartLine, "quantity">, quantity = 1): void {
	const cart = readCart();
	const existing = cart.find((l) => l.productId === line.productId);
	if (existing) existing.quantity += quantity;
	else cart.push({ ...line, quantity });
	writeCart(cart);
}

export function setQuantity(productId: string, quantity: number): void {
	const cart = readCart()
		.map((l) => (l.productId === productId ? { ...l, quantity } : l))
		.filter((l) => l.quantity > 0);
	writeCart(cart);
}

export function clearCart(): void {
	writeCart([]);
}

function cartCount(): number {
	return readCart().reduce((n, l) => n + l.quantity, 0);
}

function renderCount(): void {
	const n = cartCount();
	document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
		el.textContent = String(n);
		el.toggleAttribute("data-empty", n === 0);
	});
}

/* ---- API ----------------------------------------------------------------- */

async function api<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
	const res = await fetch(`${BASE}/${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
	const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: { message?: string; code?: string } };
	if (res.status === 404 && retry && body.error?.message === "Plugin route not found") {
		await new Promise((r) => setTimeout(r, 1200));
		return api<T>(path, init, false);
	}
	if (!res.ok || body.success === false) throw new Error(body.error?.message || `Request failed (${res.status})`);
	return body.data as T;
}

let catalogPromise: Promise<Catalog | null> | null = null;
function loadCatalog(): Promise<Catalog | null> {
	if (!catalogPromise) {
		catalogPromise = api<Catalog>("catalog")
			.then((c) => {
				currency = c.currency || currency;
				return c;
			})
			.catch(() => null);
	}
	return catalogPromise;
}

/* ---- add-to-cart buttons + availability --------------------------------- */

function wireAddToCart(root: ParentNode): void {
	root.querySelectorAll<HTMLElement>("[data-add-to-cart]:not([data-ec-wired])").forEach((btn) => {
		btn.setAttribute("data-ec-wired", "1");
		btn.addEventListener("click", async () => {
			const slug = btn.dataset.addToCart || btn.dataset.slug || "";
			let productId = btn.dataset.productId || "";
			let title = btn.dataset.title || slug;
			let price = Number(btn.dataset.price);
			if (!productId || !Number.isFinite(price)) {
				// Page-builder sections only know the slug — resolve from the catalogue.
				const cat = await loadCatalog();
				const p = cat?.products.find((x) => x.slug === slug || x.id === slug);
				if (!p) {
					flash(btn, "Not available", true);
					return;
				}
				productId = p.id;
				title = p.title;
				price = p.unitAmount / (ZERO_DECIMAL.has(currency) ? 1 : 100);
			}
			const qtyInput = document.querySelector<HTMLInputElement>(`[data-qty-for="${CSS.escape(slug)}"]`);
			const qty = Math.max(1, Number(qtyInput?.value) || 1);
			addToCart({ productId, slug, title, price }, qty);
			flash(btn, "Added ✓");
		});
	});
}

function flash(btn: HTMLElement, text: string, error = false): void {
	const original = btn.dataset.ecLabel ?? btn.textContent ?? "";
	btn.dataset.ecLabel = original;
	btn.textContent = text;
	btn.classList.toggle("ec-add-to-cart--error", error);
	window.setTimeout(() => {
		btn.textContent = original;
		btn.classList.remove("ec-add-to-cart--error");
	}, 1400);
}

async function renderAvailability(): Promise<void> {
	const labels = Array.from(document.querySelectorAll<HTMLElement>("[data-availability]"));
	if (labels.length === 0) return;
	const cat = await loadCatalog();
	if (!cat) return;
	for (const el of labels) {
		const p = cat.products.find((x) => x.id === el.dataset.availability || x.slug === el.dataset.availability);
		if (!p) continue;
		const btn = el.parentElement?.querySelector<HTMLButtonElement>("[data-add-to-cart]");
		if (p.available === null) {
			el.hidden = true;
		} else if (p.available <= 0) {
			el.hidden = false;
			el.textContent = "Sold out";
			if (btn) btn.disabled = true;
		} else if (p.available <= 5) {
			el.hidden = false;
			el.textContent = `Only ${p.available} left`;
		} else {
			el.hidden = true;
		}
	}
}

/* ---- cart page ----------------------------------------------------------- */

function renderCart(): void {
	const root = document.querySelector<HTMLElement>("[data-cart]");
	if (!root) return;
	const lines = readCart();
	if (lines.length === 0) {
		root.innerHTML = `<p class="ec-cart__empty">Your cart is empty. <a href="${BASE}/products">Browse products</a></p>`;
		return;
	}
	const subtotal = lines.reduce((n, l) => n + toMinor(l.price) * l.quantity, 0);
	root.innerHTML = `
		<table class="ec-cart__table">
			<thead><tr><th>Item</th><th>Qty</th><th>Price</th><th></th></tr></thead>
			<tbody>
				${lines
					.map(
						(l) => `<tr data-line="${esc(l.productId)}">
					<td><a href="${BASE}/products/${esc(l.slug)}">${esc(l.title)}</a></td>
					<td><input type="number" min="0" value="${l.quantity}" data-line-qty="${esc(l.productId)}" aria-label="Quantity for ${esc(l.title)}" /></td>
					<td>${money(toMinor(l.price) * l.quantity)}</td>
					<td><button type="button" class="ec-link" data-line-remove="${esc(l.productId)}">Remove</button></td>
				</tr>`,
					)
					.join("")}
			</tbody>
			<tfoot><tr><th colspan="2">Subtotal</th><th>${money(subtotal)}</th><td></td></tr></tfoot>
		</table>
		<p class="ec-cart__note">Shipping, tax and discounts are calculated at checkout.</p>
		<form class="ec-checkout" data-checkout>
			<label class="ec-form-field"><span class="ec-form-label">Email</span><input class="ec-form-input" type="email" name="email" required placeholder="you@example.com" /></label>
			<div class="ec-checkout__actions">
				<button type="submit" class="ec-form-submit" data-checkout-method="online">Pay online</button>
				<button type="submit" class="ec-form-submit ec-form-submit--secondary" data-checkout-method="manual" hidden>Order now, pay later</button>
			</div>
			<p class="ec-form-status" data-checkout-status aria-live="polite"></p>
		</form>`;
	root.querySelectorAll<HTMLInputElement>("[data-line-qty]").forEach((input) => {
		input.addEventListener("change", () => {
			setQuantity(input.dataset.lineQty!, Math.max(0, Number(input.value) || 0));
			renderCart();
		});
	});
	root.querySelectorAll<HTMLButtonElement>("[data-line-remove]").forEach((btn) => {
		btn.addEventListener("click", () => {
			setQuantity(btn.dataset.lineRemove!, 0);
			renderCart();
		});
	});
	void loadCatalog().then((cat) => {
		if (!cat) return;
		const manual = root.querySelector<HTMLButtonElement>('[data-checkout-method="manual"]');
		const online = root.querySelector<HTMLButtonElement>('[data-checkout-method="online"]');
		const hasOnline = cat.online ?? cat.stripe;
		if (manual) manual.hidden = !cat.manualPayment;
		if (online) online.hidden = !hasOnline;
		if (!hasOnline && !cat.manualPayment) setStatus(root, "Checkout is not configured yet.", true);
	});
	const form = root.querySelector<HTMLFormElement>("[data-checkout]");
	let method = "online";
	form?.querySelectorAll<HTMLButtonElement>("[data-checkout-method]").forEach((b) => b.addEventListener("click", () => (method = b.dataset.checkoutMethod || "online")));
	form?.addEventListener("submit", async (e) => {
		e.preventDefault();
		const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
		const buttons = form.querySelectorAll<HTMLButtonElement>("button");
		buttons.forEach((b) => (b.disabled = true));
		setStatus(root, "Starting checkout…");
		try {
			const result = await api<{ url: string; orderId: string; number: number }>("checkout", {
				method: "POST",
				body: JSON.stringify({ items: readCart().map((l) => ({ productId: l.productId, quantity: l.quantity })), method, email }),
			});
			if (method === "manual") clearCart();
			else sessionStorage.setItem("ec-pending-order", result.orderId);
			location.assign(result.url);
		} catch (err) {
			setStatus(root, err instanceof Error ? err.message : "Checkout failed", true);
			buttons.forEach((b) => (b.disabled = false));
		}
	});
}

function setStatus(root: ParentNode, message: string, error = false): void {
	const el = root.querySelector<HTMLElement>("[data-checkout-status]");
	if (!el) return;
	el.textContent = message;
	el.className = `ec-form-status ${error ? "ec-form-status--error" : ""}`;
}

/* ---- success page -------------------------------------------------------- */

interface PublicOrder {
	number: number;
	status: string;
	paymentMethod: string;
	currency: string;
	items: Array<{ title: string; slug: string; quantity: number; unitAmount: number }>;
	subtotal: number;
	shipping: number;
	tax: number;
	discount: number;
	total: number;
	email: string;
	customerName?: string;
	tracking?: string;
}

async function renderOrder(): Promise<void> {
	const root = document.querySelector<HTMLElement>("[data-order]");
	if (!root) return;
	const params = new URLSearchParams(location.search);
	const sessionId = params.get("session_id");
	const number = params.get("order");
	const token = params.get("token");
	try {
		let order: PublicOrder | undefined;
		if (sessionId) {
			order = (await api<{ order: PublicOrder }>(`confirm?session_id=${encodeURIComponent(sessionId)}`)).order;
			clearCart();
		} else if (number && token) {
			order = (await api<{ order: PublicOrder }>(`order?order=${encodeURIComponent(number)}&token=${encodeURIComponent(token)}`)).order;
		}
		if (!order) {
			root.innerHTML = `<p>We could not find that order.</p>`;
			return;
		}
		currency = order.currency;
		const heading = order.status === "awaiting_payment" ? "Order received" : order.status === "pending" ? "Payment pending" : "Thank you — order confirmed";
		root.innerHTML = `
			<h2>${heading}</h2>
			<p class="ec-order__meta">Order <strong>#${order.number}</strong>${order.email ? ` · confirmation sent to ${esc(order.email)}` : ""}</p>
			${order.status === "awaiting_payment" ? `<p>We will contact you with payment details.</p>` : ""}
			<table class="ec-cart__table">
				<tbody>${order.items.map((i) => `<tr><td>${i.quantity} × ${esc(i.title)}</td><td>${money(i.unitAmount * i.quantity)}</td></tr>`).join("")}</tbody>
				<tfoot>
					<tr><th>Subtotal</th><td>${money(order.subtotal)}</td></tr>
					${order.shipping ? `<tr><th>Shipping</th><td>${money(order.shipping)}</td></tr>` : ""}
					${order.tax ? `<tr><th>Tax</th><td>${money(order.tax)}</td></tr>` : ""}
					${order.discount ? `<tr><th>Discount</th><td>−${money(order.discount)}</td></tr>` : ""}
					<tr><th>Total</th><th>${money(order.total)}</th></tr>
				</tfoot>
			</table>
			${order.tracking ? `<p>Tracking: ${esc(order.tracking)}</p>` : ""}`;
	} catch (err) {
		root.innerHTML = `<p class="ec-form-status--error">${esc(err instanceof Error ? err.message : "Could not load the order")}</p>`;
	}
}

/* ---- boot ---------------------------------------------------------------- */

if (typeof document !== "undefined") {
	const boot = () => {
		renderCount();
		wireAddToCart(document);
		void renderAvailability();
		renderCart();
		void renderOrder();
		new MutationObserver(() => wireAddToCart(document)).observe(document.body, { childList: true, subtree: true });
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
	else boot();
}
