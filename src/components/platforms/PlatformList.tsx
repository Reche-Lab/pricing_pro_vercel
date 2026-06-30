"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";
import { PlatformInlineEditor, type EditablePlatform } from "@/components/platforms/PlatformInlineEditor";

type PlatformListProps = {
  platforms: Array<EditablePlatform & { key: string }>;
};

export function PlatformList({ platforms }: PlatformListProps) {
  const [items, setItems] = useState(platforms);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function persistOrder(nextItems: PlatformListProps["platforms"]) {
    setMessage("Salvando ordem...");
    const requests = nextItems.map((platform, index) =>
      fetch(`/api/platforms/${platform.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: platform.name,
          commissionRate: platform.commissionRate,
          fixedFee: platform.fixedFee,
          sellerShippingCost: platform.sellerShippingCost,
          sellerShippingThreshold: platform.sellerShippingThreshold,
          defaultPricingMode: platform.defaultPricingMode,
          sortOrder: index + 1
        })
      })
    );

    const responses = await Promise.all(requests);
    setMessage(responses.every((response) => response.ok) ? "Ordem atualizada." : "Nao foi possivel salvar toda a ordem.");
  }

  function moveOver(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    setItems((current) => {
      const from = current.findIndex((item) => item.id === draggingId);
      const to = current.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((item, index) => ({ ...item, sortOrder: index + 1 }));
    });
  }

  if (items.length === 0) return <p className="p-5 text-sm text-zinc-500">Nenhum canal cadastrado.</p>;

  return (
    <div className="divide-y divide-zinc-800">
      {items.map((platform) => (
        <div
          className={`grid gap-3 px-5 py-4 text-sm ${draggingId === platform.id ? "bg-zinc-800/60" : ""}`}
          key={platform.id}
          onDragOver={(event) => {
            event.preventDefault();
            moveOver(platform.id);
          }}
          onDrop={() => {
            setDraggingId(null);
            void persistOrder(items);
          }}
        >
          <div className="flex items-start gap-3">
            <button
              className="focus-ring mt-1 inline-flex h-9 w-9 cursor-grab items-center justify-center rounded-md border border-zinc-700 text-zinc-400 active:cursor-grabbing"
              draggable
              title="Arrastar canal"
              type="button"
              onDragEnd={() => {
                setDraggingId(null);
                void persistOrder(items);
              }}
              onDragStart={(event) => {
                setDraggingId(platform.id);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <GripVertical size={16} />
            </button>
            <div>
              <p className="font-medium text-white">{platform.name}</p>
              <p className="text-zinc-500">{platform.key}</p>
            </div>
          </div>
          <PlatformInlineEditor platform={platform} />
        </div>
      ))}
      {message ? <p className="px-5 py-3 text-sm text-zinc-400">{message}</p> : null}
    </div>
  );
}
