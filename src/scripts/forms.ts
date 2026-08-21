/**
 * Forms on the frontend (premium-forms plugin).
 *
 * Two ways to put a form on a page:
 *   1. `<CmsForm id="contact" />` in an Astro page — pre-rendered at build.
 *   2. `<div data-cms-form="contact"></div>` anywhere — including page-builder
 *      sections — hydrated here at runtime from the plugin's public definition.
 * Either way, this script handles AJAX submission, inline errors, conditional
 * fields, honeypot pass-through and Turnstile. Progressive: without JS a
 * pre-rendered form still posts normally.
 */
import { CMS_URL } from "../config";

const onCmsDomain =
	typeof location !== "undefined" &&
	!location.hostname.endsWith("github.io") &&
	location.hostname !== "localhost" &&
	location.hostname !== "127.0.0.1";
const API = onCmsDomain ? "" : CMS_URL;
const BASE = `${API}/_emdash/api/plugins/premium-forms`;

interface Field {
	name: string; label: string; type: string; required?: boolean; placeholder?: string; helpText?: string;
	defaultValue?: string; options?: Array<{ label: string; value: string }>; width?: string;
	validation?: { minLength?: number; maxLength?: number; min?: number; max?: number; pattern?: string; accept?: string };
	condition?: { field: string; op: string; value?: string };
}
interface Definition {
	name: string; slug: string; pages: Array<{ title?: string; fields: Field[] }>;
	settings: { spamProtection: string; submitLabel?: string; nextLabel?: string; prevLabel?: string };
	_turnstileSiteKey?: string | null;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function unwrap<T>(body: unknown): T {
	const b = body as { data?: T; success?: boolean };
	return (b && typeof b === "object" && "data" in b ? b.data : body) as T;
}

/* ---- render (shared by runtime hydration; CmsForm.astro mirrors this markup) ---- */

export function renderForm(def: Definition, formId: string): string {
	const multi = def.pages.length > 1;
	const attrs = (f: Field) =>
		[
			f.required ? "required" : "",
			f.placeholder ? `placeholder="${esc(f.placeholder)}"` : "",
			f.validation?.minLength != null ? `minlength="${f.validation.minLength}"` : "",
			f.validation?.maxLength != null ? `maxlength="${f.validation.maxLength}"` : "",
			f.validation?.min != null ? `min="${f.validation.min}"` : "",
			f.validation?.max != null ? `max="${f.validation.max}"` : "",
			f.validation?.pattern ? `pattern="${esc(f.validation.pattern)}"` : "",
		].join(" ");
	const control = (f: Field): string => {
		const id = `${formId}-${f.name}`;
		switch (f.type) {
			case "textarea":
				return `<textarea class="ec-form-input" id="${id}" name="${esc(f.name)}" ${attrs(f)}>${esc(f.defaultValue ?? "")}</textarea>`;
			case "select":
				return `<select class="ec-form-input" id="${id}" name="${esc(f.name)}" ${f.required ? "required" : ""}>${(f.options ?? []).map((o) => `<option value="${esc(o.value)}"${o.value === f.defaultValue ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
			case "radio":
				return `<fieldset class="ec-form-radio-group" role="radiogroup">${(f.options ?? []).map((o) => `<label class="ec-form-radio-label"><input type="radio" name="${esc(f.name)}" value="${esc(o.value)}"${o.value === f.defaultValue ? " checked" : ""}${f.required ? " required" : ""}> ${esc(o.label)}</label>`).join("")}</fieldset>`;
			case "checkbox":
				return `<label class="ec-form-checkbox-label"><input type="checkbox" class="ec-form-input" id="${id}" name="${esc(f.name)}" value="${esc(f.defaultValue || "1")}"${f.required ? " required" : ""}> ${esc(f.label)}</label>`;
			case "checkbox-group":
				return `<fieldset class="ec-form-checkbox-group">${(f.options ?? []).map((o) => `<label class="ec-form-checkbox-label"><input type="checkbox" name="${esc(f.name)}" value="${esc(o.value)}"> ${esc(o.label)}</label>`).join("")}</fieldset>`;
			case "file":
				return `<input type="file" class="ec-form-input" id="${id}" name="${esc(f.name)}" ${f.required ? "required" : ""} ${f.validation?.accept ? `accept="${esc(f.validation.accept)}"` : ""}>`;
			default:
				return `<input type="${esc(f.type)}" class="${f.type === "hidden" ? "" : "ec-form-input"}" id="${id}" name="${esc(f.name)}" value="${esc(f.defaultValue ?? "")}" ${attrs(f)}>`;
		}
	};
	const pages = def.pages
		.map(
			(p, i) => `<fieldset class="ec-form-page" data-page="${i}" aria-label="${esc(p.title || `Page ${i + 1}`)}">${multi && p.title ? `<legend class="ec-form-page-title">${esc(p.title)}</legend>` : ""}${p.fields
				.map(
					(f) => `<div class="ec-form-field ec-form-field--${esc(f.type)}${f.width === "half" ? " ec-form-field--half" : ""}"${f.condition ? ` data-condition='${esc(JSON.stringify(f.condition))}'` : ""}>${
						f.type !== "hidden" && f.type !== "checkbox" ? `<label class="ec-form-label" for="${formId}-${esc(f.name)}">${esc(f.label)}${f.required ? ' <span class="ec-form-required" aria-label="required">*</span>' : ""}</label>` : ""
					}${control(f)}${f.helpText ? `<span class="ec-form-help">${esc(f.helpText)}</span>` : ""}<span class="ec-form-error" data-error-for="${esc(f.name)}" aria-live="polite"></span></div>`,
				)
				.join("")}</fieldset>`,
		)
		.join("");
	const honeypot = def.settings.spamProtection === "honeypot" ? `<div class="ec-form-field" style="position:absolute;left:-9999px" aria-hidden="true"><label for="${formId}-_hp">Leave blank</label><input type="text" id="${formId}-_hp" name="_hp" tabindex="-1" autocomplete="off"></div>` : "";
	const turnstile = def.settings.spamProtection === "turnstile" && def._turnstileSiteKey ? `<div class="ec-form-turnstile" data-ec-turnstile data-sitekey="${esc(def._turnstileSiteKey)}"></div>` : "";
	return `<form class="ec-form" method="POST" action="${BASE}/submit" data-form-id="${esc(formId)}" data-ec-form data-submit-label="${esc(def.settings.submitLabel || "Submit")}">${pages}${honeypot}${turnstile}<input type="hidden" name="formId" value="${esc(formId)}"><div class="ec-form-nav"><button type="submit" class="ec-form-submit">${esc(def.settings.submitLabel || "Submit")}</button></div><div class="ec-form-status" data-form-status aria-live="polite"></div></form>`;
}

/* ---- runtime hydration of placeholders ---- */

async function hydratePlaceholders() {
	for (const el of document.querySelectorAll<HTMLElement>("[data-cms-form]")) {
		if (el.dataset.cmsFormReady) continue;
		el.dataset.cmsFormReady = "1";
		const slug = el.dataset.cmsForm!;
		try {
			const res = await fetch(`${BASE}/definition?id=${encodeURIComponent(slug)}`);
			if (!res.ok) throw new Error(String(res.status));
			const def = unwrap<Definition>(await res.json());
			el.innerHTML = renderForm(def, slug);
			initForm(el.querySelector<HTMLFormElement>("[data-ec-form]")!);
		} catch {
			el.innerHTML = `<p class="ec-form-status ec-form-status--error">This form is not available right now.</p>`;
		}
	}
}

/* ---- behaviour ---- */

function initForm(form: HTMLFormElement) {
	if (!form || form.dataset.ecInitialized) return;
	form.dataset.ecInitialized = "1";
	evaluateConditions(form);
	form.addEventListener("input", () => evaluateConditions(form));
	form.addEventListener("change", () => evaluateConditions(form));
	initTurnstile(form);
}

async function handleSubmit(e: Event) {
	const form = (e.target as HTMLElement).closest<HTMLFormElement>("[data-ec-form]");
	if (!form) return;
	e.preventDefault();
	let valid = true;
	form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea").forEach((input) => {
		if (!input.disabled && !input.checkValidity()) {
			valid = false;
			showFieldError(form, input.name, input.validationMessage);
		}
	});
	if (!valid) return;
	const btn = form.querySelector<HTMLButtonElement>(".ec-form-submit");
	if (btn) {
		btn.disabled = true;
		btn.textContent = "Submitting…";
	}
	form.querySelectorAll("[data-error-for]").forEach((el) => (el.textContent = ""));
	showStatus(form, "", "success");
	try {
		const formData = new FormData(form);
		let formId = form.dataset.formId ?? "";
		const data: Record<string, unknown> = {};
		const seen = new Set<string>();
		for (const [key, val] of formData) {
			if (typeof val !== "string") continue;
			if (key === "formId") formId = val;
			else if (seen.has(key)) {
				const cur = data[key];
				data[key] = Array.isArray(cur) ? [...cur, val] : [cur, val];
			} else {
				seen.add(key);
				data[key] = val;
			}
		}
		const res = await fetch(form.action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formId, data }) });
		const result = unwrap<{ success?: boolean; message?: string; redirect?: string; errors?: Array<{ field: string; message: string }> }>(await res.json());
		if (result.success) {
			if (result.redirect && /^(https?:|mailto:|tel:|\/)/.test(result.redirect)) {
				window.location.href = result.redirect;
				return;
			}
			showStatus(form, result.message || "Submitted. Thank you!", "success");
			form.reset();
		} else if (result.errors) {
			for (const err of result.errors) showFieldError(form, err.field, err.message);
		} else {
			showStatus(form, "Something went wrong. Please try again.", "error");
		}
	} catch {
		showStatus(form, "Network error. Please try again.", "error");
	} finally {
		if (btn) {
			btn.disabled = false;
			btn.textContent = form.dataset.submitLabel || "Submit";
		}
	}
}

function showFieldError(form: HTMLFormElement, name: string, message: string) {
	const el = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
	if (el) el.textContent = message;
}

function showStatus(form: HTMLFormElement, message: string, type: "success" | "error") {
	const el = form.querySelector("[data-form-status]");
	if (!el) return;
	el.textContent = message;
	el.className = message ? `ec-form-status ec-form-status--${type}` : "ec-form-status";
}

function evaluateConditions(form: HTMLFormElement) {
	form.querySelectorAll<HTMLElement>("[data-condition]").forEach((wrapper) => {
		try {
			const c = JSON.parse(wrapper.dataset.condition || "{}") as { field: string; op: string; value?: string };
			const input = form.elements.namedItem(c.field) as HTMLInputElement | null;
			if (!input) return;
			const v = input.value;
			const visible = c.op === "eq" ? v === (c.value ?? "") : c.op === "neq" ? v !== (c.value ?? "") : c.op === "filled" ? v !== "" : c.op === "empty" ? v === "" : true;
			wrapper.hidden = !visible;
			wrapper.querySelectorAll<HTMLInputElement>("input, select, textarea").forEach((el) => (el.disabled = !visible));
		} catch {
			/* show field */
		}
	});
}

function initTurnstile(form: HTMLFormElement) {
	const container = form.querySelector<HTMLElement>("[data-ec-turnstile]");
	const siteKey = container?.dataset.sitekey;
	if (!container || !siteKey) return;
	const render = () => {
		const w = window as unknown as { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => void } };
		w.turnstile?.render(container, { sitekey: siteKey });
	};
	if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) render();
	else {
		const s = document.createElement("script");
		s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
		s.async = true;
		s.onload = render;
		document.head.appendChild(s);
	}
}

function init() {
	document.querySelectorAll<HTMLFormElement>("[data-ec-form]").forEach(initForm);
	void hydratePlaceholders();
}
// This module is also imported by CmsForm.astro at BUILD time (for
// renderForm); only touch the DOM in a browser.
if (typeof document !== "undefined") {
	document.addEventListener("submit", handleSubmit);
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
}
