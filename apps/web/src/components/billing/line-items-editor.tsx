"use client";

import { Button } from "@/components/ui/button";
import type { TaxProfileRow, TreatmentCatalogRow } from "@/lib/types";

export interface DraftLineItem {
  treatmentCatalogId?: string;
  description: string;
  toothNumber?: number;
  quantity: number;
  unitPrice?: number;
  discountAmount: number;
  taxProfileId?: string;
}

export function emptyLineItem(): DraftLineItem {
  return { description: "", quantity: 1, discountAmount: 0 };
}

/**
 * Shared line-item builder for Estimates and (ad hoc / corrective)
 * Invoices. In "estimate" mode every row must pick a catalog procedure
 * (EstimateItem has no free-text description column, only
 * treatmentCatalogId); in "invoice" mode the catalog is an optional price
 * helper and the description/unitPrice the user types is what's stored.
 */
export function LineItemsEditor({
  mode,
  items,
  onChange,
  catalog,
  taxProfiles,
}: {
  mode: "estimate" | "invoice";
  items: DraftLineItem[];
  onChange: (items: DraftLineItem[]) => void;
  catalog: TreatmentCatalogRow[];
  taxProfiles: TaxProfileRow[];
}) {
  function update(i: number, patch: Partial<DraftLineItem>) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, emptyLineItem()]);
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 rounded-button border border-dashed border-border p-2">
          {mode === "estimate" ? (
            <select
              className="col-span-4 h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
              value={item.treatmentCatalogId ?? ""}
              onChange={(e) => {
                const c = catalog.find((x) => x.id === e.target.value);
                update(i, { treatmentCatalogId: e.target.value || undefined, description: c?.name ?? "" });
              }}
            >
              <option value="">Select procedure</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (₹{c.defaultPrice})
                </option>
              ))}
            </select>
          ) : (
            <>
              <select
                className="col-span-2 h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
                value={item.treatmentCatalogId ?? ""}
                onChange={(e) => {
                  const c = catalog.find((x) => x.id === e.target.value);
                  update(i, {
                    treatmentCatalogId: e.target.value || undefined,
                    description: c ? c.name : item.description,
                    unitPrice: c ? Number(c.defaultPrice) : item.unitPrice,
                  });
                }}
              >
                <option value="">(manual)</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                className="col-span-2 h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
                placeholder="Description"
                value={item.description}
                onChange={(e) => update(i, { description: e.target.value })}
              />
            </>
          )}
          <input
            type="number"
            min={1}
            className="col-span-1 h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
            placeholder="Qty"
            value={item.quantity}
            onChange={(e) => update(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            className="col-span-2 h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
            placeholder={mode === "estimate" ? "Price (auto)" : "Unit price"}
            value={item.unitPrice ?? ""}
            onChange={(e) => update(i, { unitPrice: e.target.value ? Number(e.target.value) : undefined })}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            className="col-span-1 h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
            placeholder="Discount"
            value={item.discountAmount}
            onChange={(e) => update(i, { discountAmount: Number(e.target.value) || 0 })}
          />
          <input
            type="number"
            className="col-span-1 h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
            placeholder="Tooth #"
            value={item.toothNumber ?? ""}
            onChange={(e) => update(i, { toothNumber: e.target.value ? Number(e.target.value) : undefined })}
          />
          <select
            className="col-span-2 h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
            value={item.taxProfileId ?? ""}
            onChange={(e) => update(i, { taxProfileId: e.target.value || undefined })}
          >
            <option value="">No tax</option>
            {taxProfiles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.rate}%)
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="ghost" className="col-span-1" onClick={() => remove(i)}>
            ✕
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="self-start" onClick={add}>
        + Add line
      </Button>
    </div>
  );
}
