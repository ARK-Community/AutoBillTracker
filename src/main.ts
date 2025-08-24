// For Tauri v2 (recommended):
import { Store } from "@tauri-apps/plugin-store";
import {
  sendNotification,
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";

// For Tauri v1 (if you're using v1, uncomment these and comment out the v2 imports above):
// import { Store } from "tauri-plugin-store-api";
// import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/api/notification";

type Recurrence = "none" | "monthly" | "yearly";

type Bill = {
  id: string;
  name: string;
  amount: number;
  dueDate: string; // ISO yyyy-mm-dd
  recurrence: Recurrence;
  notes?: string;
  paid: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

// For Tauri v2 store plugin - use Store.load() instead of constructor
let store: Store;

// Elements
let billForm: HTMLFormElement;
let idEl: HTMLInputElement;
let nameEl: HTMLInputElement;
let amountEl: HTMLInputElement;
let dueEl: HTMLInputElement;
let recurrenceEl: HTMLSelectElement;
let notesEl: HTMLTextAreaElement;
let resetBtn: HTMLButtonElement;
let billList: HTMLUListElement;
let searchEl: HTMLInputElement;
let filterEl: HTMLSelectElement;
let totalCountEl: HTMLElement;
let totalAmountEl: HTMLElement;

let bills: Bill[] = [];

function uid(): string {
  return crypto.randomUUID();
}

function parseMoney(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const diff = d.getTime() - today.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function nextRecurringDate(dateStr: string, recurrence: Recurrence): string {
  if (recurrence === "none") return dateStr;
  const d = new Date(dateStr);
  if (recurrence === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else if (recurrence === "yearly") {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d.toISOString().slice(0, 10);
}

async function initializeStore(): Promise<void> {
  try {
    // Initialize store - use Store.load() for v2
    store = await Store.load("bills.json");
    console.log("Store initialized successfully");
  } catch (error) {
    console.error("Failed to initialize store:", error);
    throw new Error("Could not initialize storage");
  }
}

async function load(): Promise<void> {
  try {
    if (!store) {
      throw new Error("Store not initialized");
    }
    const storedBills = await store.get<Bill[]>("bills");
    bills = storedBills ?? [];
    console.log(`Loaded ${bills.length} bills from storage`);
  } catch (error) {
    console.error("Failed to load bills from storage:", error);
    bills = [];
    showError("Failed to load bills. Starting with empty list.");
  }
}

async function save(): Promise<boolean> {
  try {
    if (!store) {
      throw new Error("Store not initialized");
    }
    await store.set("bills", bills);
    await store.save();
    console.log(`Saved ${bills.length} bills to storage`);
    return true;
  } catch (error) {
    console.error("Failed to save bills to storage:", error);
    showError("Failed to save bills. Changes may be lost.");
    return false;
  }
}

function showError(message: string): void {
  // Simple error display - you might want to implement a proper toast/notification system
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff4444;
    color: white;
    padding: 12px 16px;
    border-radius: 4px;
    z-index: 1000;
    max-width: 300px;
  `;
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);

  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 5000);
}

function render(): void {
  try {
    const q = searchEl.value.toLowerCase();
    const status = filterEl.value;

    const filtered = bills.filter((b) => {
      const matches =
        b.name.toLowerCase().includes(q) ||
        (b.notes ?? "").toLowerCase().includes(q);
      if (!matches) return false;
      const d = daysUntil(b.dueDate);
      if (status === "due") return !b.paid && d >= 0 && d <= 7;
      if (status === "overdue") return !b.paid && d < 0;
      if (status === "paid") return b.paid;
      if (status === "unpaid") return !b.paid;
      return true;
    });

    billList.innerHTML = "";
    let total = 0;
    for (const b of filtered) {
      if (!b.paid) total += b.amount;
      const li = document.createElement("li");
      li.className = "bill-item";
      const d = daysUntil(b.dueDate);
      const dueClass = b.paid
        ? "paid"
        : d < 0
          ? "overdue"
          : d <= 7
            ? "due"
            : "ok";

      // Escape HTML to prevent XSS
      const escapedName = escapeHtml(b.name);
      const escapedNotes = b.notes ? escapeHtml(b.notes) : "";

      li.innerHTML = `
        <div class="title ${dueClass}">
          <strong>${escapedName}</strong>
          <span class="amount">${fmtMoney(b.amount)}</span>
        </div>
        <div class="meta">
          <span>Due: ${b.dueDate} (${d === 0 ? "today" : d > 0 ? `${d}d` : `${-d}d ago`})</span>
          ${b.recurrence !== "none" ? `<span class="badge">${b.recurrence}</span>` : ""}
          ${b.paid ? `<span class="badge paid">paid</span>` : ""}
        </div>
        <div class="item-actions">
          <button data-action="toggle-paid" data-id="${b.id}">${b.paid ? "Mark Unpaid" : "Mark Paid"}</button>
          <button data-action="edit" data-id="${b.id}" class="secondary">Edit</button>
          <button data-action="delete" data-id="${b.id}" class="danger">Delete</button>
        </div>
        ${escapedNotes ? `<p class="notes">${escapedNotes}</p>` : ""}
      `;
      billList.appendChild(li);
    }

    totalCountEl.textContent = `${filtered.length} bill${filtered.length !== 1 ? "s" : ""}`;
    totalAmountEl.textContent = `Total: ${fmtMoney(total)}`;
  } catch (error) {
    console.error("Failed to render bills:", error);
    showError("Failed to display bills");
  }
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resetForm(): void {
  idEl.value = "";
  nameEl.value = "";
  amountEl.value = "";
  dueEl.value = new Date().toISOString().slice(0, 10);
  recurrenceEl.value = "monthly";
  notesEl.value = "";
}

function fillForm(b: Bill): void {
  idEl.value = b.id;
  nameEl.value = b.name;
  amountEl.value = String(b.amount);
  dueEl.value = b.dueDate;
  recurrenceEl.value = b.recurrence;
  notesEl.value = b.notes ?? "";
}

async function ensureNotifPermission(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    return granted;
  } catch (error) {
    console.error("Notification permission error:", error);
    return false;
  }
}

async function maybeNotifyDue(): Promise<void> {
  try {
    const granted = await ensureNotifPermission();
    if (!granted) {
      console.log("Notification permission not granted");
      return;
    }

    // Notify for items due today or overdue (up to 3 days) and unpaid
    const dueNow = bills.filter((b) => {
      if (b.paid) return false;
      const days = daysUntil(b.dueDate);
      return days <= 0 && days >= -3;
    });

    if (dueNow.length === 0) return;

    const body = dueNow
      .slice(0, 4) // Limit to 4 bills to keep notification readable
      .map((b) => {
        const days = daysUntil(b.dueDate);
        const dueText = days === 0 ? "today" : `${-days}d overdue`;
        return `${b.name} (${fmtMoney(b.amount)}) ${dueText}`;
      })
      .join("\n");

    await sendNotification({
      title: `${dueNow.length} Bill${dueNow.length > 1 ? "s" : ""} Due`,
      body,
    });

    console.log(`Sent notification for ${dueNow.length} due bills`);
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
}

function validateBillForm(): string | null {
  const name = nameEl.value.trim();
  const amount = parseMoney(amountEl.value);
  const dueDate = dueEl.value;

  if (!name) return "Bill name is required";
  if (amount <= 0) return "Amount must be greater than 0";
  if (!dueDate) return "Due date is required";

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dueDate)) return "Invalid due date format";

  return null;
}

function upsertBillFromForm(): boolean {
  const validationError = validateBillForm();
  if (validationError) {
    showError(validationError);
    return false;
  }

  try {
    const id = idEl.value || uid();
    const now = new Date().toISOString();
    const existingIdx = bills.findIndex((b) => b.id === id);

    const record: Bill = {
      id,
      name: nameEl.value.trim(),
      amount: parseMoney(amountEl.value),
      dueDate: dueEl.value,
      recurrence: recurrenceEl.value as Recurrence,
      notes: notesEl.value.trim() || undefined,
      paid: existingIdx >= 0 ? bills[existingIdx].paid : false,
      createdAt: existingIdx >= 0 ? bills[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      bills[existingIdx] = record;
    } else {
      bills.push(record);
    }

    return true;
  } catch (error) {
    console.error("Failed to create/update bill:", error);
    showError("Failed to save bill");
    return false;
  }
}

// Event wiring
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // Initialize DOM elements
    billForm = document.querySelector("#bill-form")!;
    idEl = document.querySelector("#bill-id")!;
    nameEl = document.querySelector("#bill-name")!;
    amountEl = document.querySelector("#bill-amount")!;
    dueEl = document.querySelector("#bill-due")!;
    recurrenceEl = document.querySelector("#bill-recurrence")!;
    notesEl = document.querySelector("#bill-notes")!;
    resetBtn = document.querySelector("#reset-form")!;
    billList = document.querySelector("#bill-list")!;
    searchEl = document.querySelector("#search")!;
    filterEl = document.querySelector("#filter-status")!;
    totalCountEl = document.querySelector("#total-count")!;
    totalAmountEl = document.querySelector("#total-amount")!;

    // Check if all required elements exist
    if (!billForm || !nameEl || !amountEl || !dueEl || !billList) {
      throw new Error("Required DOM elements not found");
    }

    // Initialize store first
    await initializeStore();
    await load();

    // Set default due date if not set
    if (!dueEl.value) {
      dueEl.value = new Date().toISOString().slice(0, 10);
    }

    render();
    await maybeNotifyDue();

    // Form submission
    billForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (upsertBillFromForm()) {
        const saved = await save();
        if (saved) {
          render();
          resetForm();
        }
      }
    });

    // Reset button
    resetBtn.addEventListener("click", () => resetForm());

    // Search and filter
    searchEl.addEventListener("input", render);
    filterEl.addEventListener("change", render);

    // Bill list actions
    billList.addEventListener("click", async (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;

      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      if (!id || !action) return;

      const idx = bills.findIndex((b) => b.id === id);
      if (idx < 0) return;

      const b = bills[idx];

      try {
        if (action === "edit") {
          fillForm(b);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (action === "delete") {
          if (confirm(`Are you sure you want to delete "${b.name}"?`)) {
            bills.splice(idx, 1);
            const saved = await save();
            if (saved) {
              render();
            }
          }
        } else if (action === "toggle-paid") {
          b.paid = !b.paid;
          b.updatedAt = new Date().toISOString();

          if (b.paid && b.recurrence !== "none") {
            // If paid and recurring, schedule the next occurrence
            b.dueDate = nextRecurringDate(b.dueDate, b.recurrence);
            b.paid = false; // next cycle is unpaid
          }

          const saved = await save();
          if (saved) {
            render();
          }
        }
      } catch (error) {
        console.error(`Failed to ${action} bill:`, error);
        showError(`Failed to ${action} bill`);
      }
    });
  } catch (error) {
    console.error("Failed to initialize application:", error);
    showError("Failed to initialize the application");
  }
});
