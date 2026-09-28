import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceBuilder } from "./invoice-builder";
import { createDefaultInvoice } from "@/lib/invoice";
import type { SavedInvoiceRecord } from "@/lib/saved-invoices";

vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));

const clientA = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Client A",
  email: "a@example.com",
  address: "Address A",
  vatNumber: "",
  updatedAt: "2026-01-01",
};
const invoice = {
  ...createDefaultInvoice(),
  id: "invoice-b",
  invoiceNumber: "INV-2026-002",
  issuer: {
    name: "Studio",
    email: "studio@example.com",
    address: "Berlin",
    taxNumber: "",
    vatNumber: "",
  },
  client: {
    name: "Client B",
    email: "b@example.com",
    address: "Address B",
    vatNumber: "",
  },
  banking: {
    accountName: "Studio",
    iban: "DE02120300000000202051",
    bic: "BYLADEM1",
  },
  items: [
    {
      id: "line-b",
      description: "Consulting",
      hours: 1,
      unitPriceCents: 10000,
    },
  ],
};
const record: SavedInvoiceRecord = {
  invoice,
  status: "draft",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  sentAt: null,
  paidAt: null,
};
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  await act(async () => button.click());
}
async function change(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  await act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function loadInvoice() {
  await click("Invoices 1");
  await act(async () =>
    (container.querySelector(".invoice-load") as HTMLButtonElement).click(),
  );
}
function field(name: string) {
  return container.querySelector(`[name="${name}"]`) as HTMLInputElement;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  fetchMock = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ invoiceNumber: "INV-2026-003" })),
    );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(InvoiceBuilder, {
        initialProfile: null,
        initialClients: [clientA],
        initialSavedInvoices: [record],
        initialNextInvoiceNumber: "INV-2026-003",
        initialDataError: false,
        userEmail: "test@example.com",
      }),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("invoice editor data protection", () => {
  it("clears the previous client selection when loading another invoice", async () => {
    await change(
      container.querySelector(
        ".saved-client-controls select",
      ) as HTMLSelectElement,
      "11111111-1111-4111-8111-111111111111",
    );
    await loadInvoice();
    expect(field("client.name").value).toBe("Client B");
    expect(
      (
        container.querySelector(
          ".saved-client-controls select",
        ) as HTMLSelectElement
      ).value,
    ).toBe("");
    expect(container.textContent).toContain("Save client");
  });
  it("keeps edited values when switching invoices is cancelled", async () => {
    await change(field("client.name"), "Unsaved client");
    vi.mocked(window.confirm).mockReturnValue(false);
    await loadInvoice();
    expect(field("client.name").value).toBe("Unsaved client");
  });
  it("keeps edited values when creating an invoice is cancelled", async () => {
    await change(field("client.name"), "Unsaved client");
    vi.mocked(window.confirm).mockReturnValue(false);
    await click("Invoices 1");
    await click("+ New");
    expect(field("client.name").value).toBe("Unsaved client");
  });
  it("requires saving edits before marking the active invoice sent", async () => {
    await loadInvoice();
    await change(field("client.name"), "Edited client");
    await click("Invoices 1");
    await change(
      container.querySelector(".status-select") as HTMLSelectElement,
      "sent",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(field("client.name").value).toBe("Edited client");
    expect(container.querySelector(".database-message")?.textContent).toMatch(
      /save/i,
    );
  });
});

describe("invoice editor request failures", () => {
  it.each(["Save", "Save my details"])(
    "shows a connection error for %s without losing edits",
    async (button) => {
      await loadInvoice();
      await change(field("client.name"), "Unsaved edit");
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await click(button);
      expect(container.querySelector(".database-message")?.textContent).toMatch(
        /could not|unavailable|connection/i,
      );
      expect(field("client.name").value).toBe("Unsaved edit");
    },
  );
  it("shows a save error for a non-JSON response", async () => {
    await loadInvoice();
    fetchMock.mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    await click("Save");
    expect(container.querySelector(".database-message")?.textContent).toMatch(
      /could not|unavailable/i,
    );
  });
  it("shows an error for a failed status request", async () => {
    await loadInvoice();
    await click("Invoices 1");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await change(
      container.querySelector(".status-select") as HTMLSelectElement,
      "paid",
    );
    expect(container.querySelector(".database-message")?.textContent).toMatch(
      /could not|unavailable|connection/i,
    );
  });
  it("still reports a successful save if refreshing the next number fails", async () => {
    await loadInvoice();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ invoice: record })))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await click("Save");
    expect(container.querySelector(".database-message")?.textContent).toContain(
      "saved as Draft",
    );
  });
});

describe("status request races", () => {
  it("preserves edits entered while the Sent request is pending", async () => {
    await loadInvoice();
    await click("Invoices 1");
    let resolveStatus!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveStatus = resolve;
        }),
    );
    await change(
      container.querySelector(".status-select") as HTMLSelectElement,
      "sent",
    );
    await change(field("client.name"), "Edited while sending");
    await act(async () => {
      resolveStatus(
        new Response(
          JSON.stringify({
            invoice: { ...record, status: "sent", sentAt: "2026-01-01" },
          }),
        ),
      );
    });
    expect(field("client.name").value).toBe("Edited while sending");
    expect(field("invoiceNumber").value).toBe("INV-2026-002");
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it("opens the next invoice after marking an unchanged invoice Sent", async () => {
    await loadInvoice();
    await click("Invoices 1");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          invoice: { ...record, status: "sent", sentAt: "2026-01-01" },
        }),
      ),
    );
    await change(
      container.querySelector(".status-select") as HTMLSelectElement,
      "sent",
    );
    expect(field("invoiceNumber").value).toBe("INV-2026-003");
    expect(field("client.name").value).toBe("");
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

it("allows sending after saving values normalized by validation", async () => {
  await loadInvoice();
  await change(field("client.name"), " Client B ");
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ invoice: record })),
  );
  await click("Save");
  expect(field("client.name").value).toBe("Client B");
  await click("Invoices 1");
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        invoice: { ...record, status: "sent", sentAt: "2026-01-01" },
      }),
    ),
  );
  await change(
    container.querySelector(".status-select") as HTMLSelectElement,
    "sent",
  );
  expect(field("invoiceNumber").value).toBe("INV-2026-003");
});

it("does not restore a stale client selection after loading another invoice", async () => {
  await change(
    container.querySelector(
      ".saved-client-controls select",
    ) as HTMLSelectElement,
    "11111111-1111-4111-8111-111111111111",
  );
  let resolveClient!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        resolveClient = resolve;
      }),
  );
  await click("Update client");
  await loadInvoice();
  await act(async () => {
    resolveClient(new Response(JSON.stringify({ client: clientA })));
  });
  expect(field("client.name").value).toBe("Client B");
  expect(
    (
      container.querySelector(
        ".saved-client-controls select",
      ) as HTMLSelectElement
    ).value,
  ).toBe("");
});
