"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Calculator,
  CircleDollarSign,
  Clipboard,
  FileText,
  Image as ImageIcon,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  UserRound,
  Trash2,
  Upload,
  RotateCcw,
  Save,
  TrendingUp,
  X
} from "lucide-react";
import {
  buildPricingSimulationSeries,
  calculateCurveUnitPrice,
  calculateQuote,
  comparePricingSimulationSeries,
  DEFAULT_ANCHOR_QUANTITIES,
  normalizePricingCurvePoints,
  recomputeIntermediateAnchors
} from "@/domain/pricing/pricing";
import type { DemoProductVariant } from "@/domain/pricing/defaults";
import type { PlatformRule, PricingCurve, PricingCurveMode } from "@/domain/pricing/types";
import { fetchCepAddress, formatCep, normalizeCep, type CepAddress } from "@/lib/cep";
import { OlistQuoteActions } from "@/components/quotes/OlistQuoteActions";

export type PricingPlatformOption = PlatformRule & {
  name: string;
  defaultPricingMode?: PricingCurveMode;
};

type PricingCalculatorProps = {
  activeShippingServices?: {
    correios: boolean;
    melhorEnvio: boolean;
  };
  defaultOriginPostalCode?: string;
  variants: DemoProductVariant[];
  platforms: Record<string, PricingPlatformOption>;
  demoMode?: boolean;
  readonlyMode?: boolean;
};

type ChartPoint = {
  baseValue: number;
  finalValue: number;
  quantity: number;
  label: string;
  value: number;
  isAnchor?: boolean;
};

type DraftQuoteItem = {
  id: string;
  productVariantId: string;
  productLabel: string;
  artworkName: string;
  artworkFile?: ArtworkFilePayload | null;
  pricingCurve: PricingCurve;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

type ArtworkFilePayload = {
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/jpg" | "image/webp" | "application/pdf";
  fileSize: number;
  dataUrl: string;
};

type DraftPricingRule = "per_art_average" | "per_item" | "aggregate_total";
type ShippingServiceOption = "manual" | "melhor_envio" | "pac" | "sedex";
type MelhorEnvioQuoteOption = {
  code: string;
  name: string;
  companyName: string;
  price: number;
  deliveryTime: number | null;
  raw: unknown;
};
type ShippingPackagingSummary = {
  boxName: string;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  boxWeightKg: number;
  boxesNeeded: number;
  capacity: number;
  grossWeightKg: number;
  grossWeightPerBoxKg: number;
};
type OlistCustomerLookupResult = {
  id: string;
  code: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  personType: string;
  status: string;
  postalCode: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  district: string;
  city: string;
  state: string;
};
type OlistCustomerLookupMode = "auto" | "nome" | "cpfCnpj" | "celular" | "email" | "codigo";

const SIMULATION_QUANTITIES = [1, 10, 25, 50, 100, 250, 500, 1000] as const;
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const MAX_ARTWORK_FILE_SIZE = 5 * 1024 * 1024;
const emptyPlatform: PricingPlatformOption = {
  name: "Canal nao configurado",
  commissionRate: 0,
  fixedFee: 0,
  sellerShippingCost: 0,
  sellerShippingThreshold: 0,
  defaultPricingMode: "interpolated"
};

export function PricingCalculator({
  activeShippingServices = { correios: false, melhorEnvio: false },
  defaultOriginPostalCode = "",
  variants,
  platforms,
  demoMode = false,
  readonlyMode = false
}: PricingCalculatorProps) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [platformKey, setPlatformKey] = useState(Object.keys(platforms)[0] ?? "direct");

  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const platform: PricingPlatformOption = platforms[platformKey] ?? Object.values(platforms)[0] ?? emptyPlatform;
  const activeVariantCurve = useMemo(() => resolveVariantCurve(variant, platformKey, platform.defaultPricingMode), [platform.defaultPricingMode, platformKey, variant]);
  const [currentCurve, setCurrentCurve] = useState<PricingCurve>(() => activeVariantCurve);
  const [simulatedCurve, setSimulatedCurve] = useState<PricingCurve>(() => activeVariantCurve);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickCustomerDocument, setQuickCustomerDocument] = useState("");
  const [quickCustomerEmail, setQuickCustomerEmail] = useState("");
  const [quickCustomerPhoneDdi, setQuickCustomerPhoneDdi] = useState("+55");
  const [quickCustomerPhone, setQuickCustomerPhone] = useState("");
  const [quickCustomerExternalOlistId, setQuickCustomerExternalOlistId] = useState<string | null>(null);
  const [quickCustomerPostalCode, setQuickCustomerPostalCode] = useState("");
  const [quickCustomerAddressLine, setQuickCustomerAddressLine] = useState("");
  const [quickCustomerAddressNumber, setQuickCustomerAddressNumber] = useState("");
  const [quickCustomerAddressComplement, setQuickCustomerAddressComplement] = useState("");
  const [quickCustomerDistrict, setQuickCustomerDistrict] = useState("");
  const [quickCustomerCity, setQuickCustomerCity] = useState("");
  const [quickCustomerState, setQuickCustomerState] = useState("");
  const [quickCustomerAddress, setQuickCustomerAddress] = useState<CepAddress | null>(null);
  const [olistCustomerLookupMode, setOlistCustomerLookupMode] = useState<OlistCustomerLookupMode>("auto");
  const [olistCustomerLookupTerm, setOlistCustomerLookupTerm] = useState("");
  const [olistCustomerLookupState, setOlistCustomerLookupState] = useState<"idle" | "loading" | "error">("idle");
  const [olistCustomerLookupMessage, setOlistCustomerLookupMessage] = useState("");
  const [olistCustomerResults, setOlistCustomerResults] = useState<OlistCustomerLookupResult[]>([]);
  const [destinationPostalCode, setDestinationPostalCode] = useState("");
  const [destinationAddress, setDestinationAddress] = useState<CepAddress | null>(null);
  const [originPostalCode, setOriginPostalCode] = useState(formatCep(defaultOriginPostalCode));
  const [originAddress, setOriginAddress] = useState<CepAddress | null>(null);
  const [cepLookupMessage, setCepLookupMessage] = useState("");
  const [shippingService, setShippingService] = useState<ShippingServiceOption>(() => defaultShippingService(activeShippingServices));
  const [shippingAmount, setShippingAmount] = useState(0);
  const [shippingQuoteState, setShippingQuoteState] = useState<"idle" | "loading" | "error">("idle");
  const [shippingQuoteMessage, setShippingQuoteMessage] = useState("");
  const [shippingPackaging, setShippingPackaging] = useState<ShippingPackagingSummary | null>(null);
  const [melhorEnvioOptions, setMelhorEnvioOptions] = useState<MelhorEnvioQuoteOption[]>([]);
  const [selectedMelhorEnvioServiceCode, setSelectedMelhorEnvioServiceCode] = useState("");
  const [includeMelhorEnvioInsurance, setIncludeMelhorEnvioInsurance] = useState(true);
  const [includeShipping, setIncludeShipping] = useState(false);
  const [includeCommission, setIncludeCommission] = useState(true);
  const [includeFixedFee, setIncludeFixedFee] = useState(true);
  const [includeSellerShipping, setIncludeSellerShipping] = useState(true);
  const [localCommissionRate, setLocalCommissionRate] = useState(platform.commissionRate);
  const [localFixedFee, setLocalFixedFee] = useState(platform.fixedFee);
  const [localSellerShippingCost, setLocalSellerShippingCost] = useState(platform.sellerShippingCost);
  const [quickState, setQuickState] = useState<"idle" | "creating_pdf" | "copying_text" | "copied" | "error">("idle");
  const [quickMessage, setQuickMessage] = useState("");
  const [quickText, setQuickText] = useState("");
  const [lastOlistQuoteId, setLastOlistQuoteId] = useState<string | null>(null);
  const [draftArtworkName, setDraftArtworkName] = useState("Arte 1");
  const [draftArtworkFile, setDraftArtworkFile] = useState<ArtworkFilePayload | null>(null);
  const [draftArtworkMessage, setDraftArtworkMessage] = useState("");
  const [draftItems, setDraftItems] = useState<DraftQuoteItem[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftPricingRule, setDraftPricingRule] = useState<DraftPricingRule>("per_item");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftState, setDraftState] = useState<"idle" | "creating" | "creating_pdf" | "copying_text" | "copied" | "error">("idle");
  const [draftMessage, setDraftMessage] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftAttention, setDraftAttention] = useState(false);

  useEffect(() => {
    if (variant) {
      setCurrentCurve(activeVariantCurve);
      setSimulatedCurve(activeVariantCurve);
      setSaveState("idle");
      setQuickState("idle");
      setQuickMessage("");
      setQuickText("");
      setLastOlistQuoteId(null);
      setDraftArtworkName((current) => current || "Arte 1");
    }
  }, [activeVariantCurve, variant]);

  useEffect(() => {
    setLocalCommissionRate(platform.commissionRate);
    setLocalFixedFee(platform.fixedFee);
    setLocalSellerShippingCost(platform.sellerShippingCost);
  }, [platform.commissionRate, platform.fixedFee, platform.sellerShippingCost, platformKey]);

  useEffect(() => {
    if (shippingService !== "melhor_envio") {
      setMelhorEnvioOptions([]);
      setSelectedMelhorEnvioServiceCode("");
    }
  }, [shippingService]);

  const effectivePlatform = useMemo(
    () => ({
      ...platform,
      commissionRate: includeCommission ? localCommissionRate : 0,
      fixedFee: includeFixedFee ? localFixedFee : 0,
      sellerShippingCost: includeSellerShipping ? localSellerShippingCost : 0
    }),
    [includeCommission, includeFixedFee, includeSellerShipping, localCommissionRate, localFixedFee, localSellerShippingCost, platform]
  );

  const currentResult = useMemo(() => {
    if (!variant || !platform) return null;
    return calculateQuote({
      quantity,
      unitCost: variant.unitCost,
      method: "anchors",
      curve: currentCurve,
      platform: effectivePlatform
    });
  }, [currentCurve, effectivePlatform, platform, quantity, variant]);

  const simulatedResult = useMemo(() => {
    if (!variant || !platform) return null;
    return calculateQuote({
      quantity,
      unitCost: variant.unitCost,
      method: "anchors",
      curve: simulatedCurve,
      platform: effectivePlatform
    });
  }, [effectivePlatform, platform, quantity, simulatedCurve, variant]);

  const selectedMelhorEnvioOption = useMemo(
    () => melhorEnvioOptions.find((option) => option.code === selectedMelhorEnvioServiceCode) ?? null,
    [melhorEnvioOptions, selectedMelhorEnvioServiceCode]
  );
  const shippingServiceLabel = shippingService === "melhor_envio" && selectedMelhorEnvioOption
    ? `Melhor Envio - ${selectedMelhorEnvioOption.companyName} - ${selectedMelhorEnvioOption.name}`
    : shippingService;

  const currentSeries = useMemo(() => {
    if (!variant || !platform) return [];
    return buildPricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        curve: currentCurve,
        platform: effectivePlatform
      },
      [...SIMULATION_QUANTITIES]
    );
  }, [currentCurve, effectivePlatform, platform, variant]);

  const simulatedSeries = useMemo(() => {
    if (!variant || !platform) return [];
    return buildPricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        curve: simulatedCurve,
        platform: effectivePlatform
      },
      [...SIMULATION_QUANTITIES]
    );
  }, [effectivePlatform, platform, simulatedCurve, variant]);

  const comparison = useMemo(() => {
    if (!variant || !platform) return [];
    return comparePricingSimulationSeries(
      {
        unitCost: variant.unitCost,
        method: "anchors",
        curve: currentCurve,
        platform: effectivePlatform
      },
      {
        unitCost: variant.unitCost,
        method: "anchors",
        curve: simulatedCurve,
        platform: effectivePlatform
      },
      [quantity]
    );
  }, [currentCurve, effectivePlatform, platform, quantity, simulatedCurve, variant]);

  const draftItemsSubtotal = useMemo(
    () => draftItems.reduce((sum, item) => sum + item.totalPrice, 0),
    [draftItems]
  );
  const draftEstimatedTotal = useMemo(
    () => draftItemsSubtotal + (includeShipping ? shippingAmount : 0),
    [draftItemsSubtotal, includeShipping, shippingAmount]
  );

  useEffect(() => {
    setShippingAmount(0);
    setIncludeShipping(false);
    setShippingPackaging(null);
    setShippingQuoteMessage("");
  }, [draftItems, quantity, variantId]);

  if (!variant || !platform || !currentResult || !simulatedResult) {
    return <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-6">Nenhum produto disponivel.</div>;
  }

  const selectedComparison = comparison[0];
  const simulatedChanged = hasCurveChanges(currentCurve, simulatedCurve);
  const persistentActionsDisabled = readonlyMode;
  const quoteActionsDisabled = readonlyMode;
  const customerValidation = validateCustomerFields({
    document: quickCustomerDocument,
    email: quickCustomerEmail,
    phone: quickCustomerPhone,
    phoneDdi: quickCustomerPhoneDdi
  });
  const customerHasValidationErrors = Object.values(customerValidation.errors).some(Boolean);
  const customerPhoneForQuote = formatInternationalPhone(quickCustomerPhoneDdi, quickCustomerPhone);
  const effectiveDestinationPostalCode =
    normalizeCep(quickCustomerPostalCode).length === 8 ? quickCustomerPostalCode : destinationPostalCode;
  const effectiveDestinationAddress =
    normalizeCep(quickCustomerPostalCode).length === 8 ? quickCustomerAddress : destinationAddress;

  function updateCurvePoint(index: number, field: "quantity" | "unitPrice", value: number) {
    setSimulatedCurve((current) => {
      const points = current.points.map((point, pointIndex) =>
        pointIndex === index
          ? {
              ...point,
              [field]: Number.isFinite(value) ? Math.max(field === "quantity" ? 1 : 0, Math.trunc(value * (field === "quantity" ? 1 : 10000)) / (field === "quantity" ? 1 : 10000)) : 0
            }
          : point
      );
      return { ...current, points };
    });
    setSaveState("idle");
    setQuickState("idle");
    setQuickMessage("");
    setQuickText("");
  }

  async function lookupShippingCep(kind: "destination" | "origin") {
    const value = kind === "destination" ? destinationPostalCode : originPostalCode;
    const digits = normalizeCep(value);
    if (digits.length !== 8) return;

    setCepLookupMessage(kind === "destination" ? "Buscando endereço de destino..." : "Buscando endereço de origem...");
    const address = await fetchCepAddress(digits).catch(() => null);
    if (!address) {
      setCepLookupMessage("CEP não encontrado. Confira o número informado.");
      if (kind === "destination") setDestinationAddress(null);
      else setOriginAddress(null);
      return;
    }

    if (kind === "destination") {
      setDestinationPostalCode(address.cep);
      setDestinationAddress(address);
    } else {
      setOriginPostalCode(address.cep);
      setOriginAddress(address);
    }
    setCepLookupMessage("Endereço preenchido pelo CEP.");
  }

  async function lookupCustomerCep() {
    const digits = normalizeCep(quickCustomerPostalCode);
    if (digits.length !== 8) return;

    setCepLookupMessage("Buscando endereço do cliente...");
    const address = await fetchCepAddress(digits).catch(() => null);
    if (!address) {
      setCepLookupMessage("CEP do cliente não encontrado. Preencha manualmente.");
      setQuickCustomerAddress(null);
      return;
    }

    setQuickCustomerPostalCode(address.cep);
    setQuickCustomerAddressLine(address.street);
    setQuickCustomerDistrict(address.district);
    setQuickCustomerCity(address.city);
    setQuickCustomerState(address.state);
    setQuickCustomerAddress(address);
    setCepLookupMessage("Endereço do cliente preenchido pelo CEP.");
  }

  async function lookupOlistCustomer() {
    if (demoMode || readonlyMode) return;
    const searchValue = olistCustomerLookupTerm.trim()
      || quickCustomerDocument.trim()
      || quickCustomerPhone.trim()
      || quickCustomerEmail.trim()
      || quickCustomerName.trim();
    if (!searchValue) {
      setOlistCustomerLookupState("error");
      setOlistCustomerLookupMessage("Informe nome, CPF/CNPJ, telefone ou e-mail para buscar no Olist.");
      setOlistCustomerResults([]);
      return;
    }

    setOlistCustomerLookupState("loading");
    setOlistCustomerLookupMessage("Buscando cliente no Olist...");
    setOlistCustomerResults([]);
    const hasExplicitSearchTerm = Boolean(olistCustomerLookupTerm.trim());
    try {
      const response = await fetch("/api/pricing/olist/customer-lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: olistCustomerLookupMode,
          value: searchValue,
          nome: hasExplicitSearchTerm ? "" : quickCustomerName,
          cpfCnpj: hasExplicitSearchTerm ? "" : quickCustomerDocument,
          celular: hasExplicitSearchTerm ? "" : quickCustomerPhone,
          email: hasExplicitSearchTerm ? "" : quickCustomerEmail
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setOlistCustomerLookupState("error");
        setOlistCustomerLookupMessage(data?.error ?? "Não foi possível consultar cliente no Olist.");
        return;
      }

      setOlistCustomerLookupState("idle");
      setOlistCustomerResults(data.customers ?? []);
      setOlistCustomerLookupMessage(data.message ?? "Consulta concluída.");
    } catch {
      setOlistCustomerLookupState("error");
      setOlistCustomerLookupMessage("Falha de comunicação ao consultar cliente no Olist.");
    }
  }

  function applyOlistCustomer(customer: OlistCustomerLookupResult) {
    setQuickCustomerExternalOlistId(customer.id || null);
    setQuickCustomerName(customer.name || quickCustomerName);
    setQuickCustomerDocument(customer.document ? formatCpfCnpj(customer.document) : quickCustomerDocument);
    setQuickCustomerEmail(customer.email || quickCustomerEmail);
    setQuickCustomerPhone(customer.phone ? formatBrazilPhone(stripBrazilDdi(customer.phone)) : quickCustomerPhone);
    setQuickCustomerPhoneDdi(customer.phone?.startsWith("55") ? "+55" : quickCustomerPhoneDdi);
    setQuickCustomerPostalCode(customer.postalCode ? formatCep(customer.postalCode) : quickCustomerPostalCode);
    setQuickCustomerAddressLine(customer.addressLine || quickCustomerAddressLine);
    setQuickCustomerAddressNumber(customer.addressNumber || quickCustomerAddressNumber);
    setQuickCustomerAddressComplement(customer.addressComplement || quickCustomerAddressComplement);
    setQuickCustomerDistrict(customer.district || quickCustomerDistrict);
    setQuickCustomerCity(customer.city || quickCustomerCity);
    setQuickCustomerState(customer.state ? customer.state.toUpperCase() : quickCustomerState);
    setQuickCustomerAddress(customer.postalCode ? {
      cep: formatCep(customer.postalCode),
      street: customer.addressLine,
      district: customer.district,
      city: customer.city,
      state: customer.state.toUpperCase()
    } : quickCustomerAddress);
    setOlistCustomerLookupMessage(`Dados preenchidos com ${customer.name || "cliente selecionado"} do Olist.`);
  }

  function resetAnchors() {
    setSimulatedCurve(currentCurve);
    setSaveState("idle");
  }

  function smoothAnchors() {
    setSimulatedCurve((current) => {
      const anchors = pricingCurveToDefaultAnchors(current);
      return { ...current, mode: "interpolated", points: anchorsToPointList(recomputeIntermediateAnchors(anchors)) };
    });
    setSaveState("idle");
  }

  function updateCurveMode(mode: PricingCurveMode) {
    setSimulatedCurve((current) => ({ ...current, mode }));
    setSaveState("idle");
  }

  function addCurvePoint() {
    setSimulatedCurve((current) => {
      const points = normalizePricingCurvePoints(current.points);
      const last = points[points.length - 1] ?? { quantity: 1, unitPrice: 0 };
      return {
        ...current,
        points: [...points, { quantity: last.quantity + 100, unitPrice: last.unitPrice }]
      };
    });
    setSaveState("idle");
  }

  function removeCurvePoint(index: number) {
    setSimulatedCurve((current) => ({
      ...current,
      points: current.points.filter((_, pointIndex) => pointIndex !== index)
    }));
    setSaveState("idle");
  }

  async function calculateShipping() {
    if (!simulatedResult) return;

    setShippingQuoteMessage("");
    setShippingPackaging(null);
    if (shippingService !== "melhor_envio") {
      setMelhorEnvioOptions([]);
      setSelectedMelhorEnvioServiceCode("");
    }
    setShippingQuoteState("loading");

    const origin = normalizeCep(originPostalCode);
    const destination = normalizeCep(effectiveDestinationPostalCode);
    if (origin.length !== 8 || destination.length !== 8) {
      setShippingQuoteState("error");
      setShippingQuoteMessage("Informe CEP de origem e destino para calcular o frete.");
      return;
    }

    if (shippingService === "manual") {
      setShippingQuoteState("error");
      setShippingQuoteMessage("Outros/manual não calcula automaticamente. Informe o valor do frete estimado.");
      return;
    }

    if ((shippingService === "sedex" || shippingService === "pac") && !activeShippingServices.correios) {
      setShippingQuoteState("error");
      setShippingQuoteMessage("Correios não está habilitado para este tenant.");
      return;
    }

    if (shippingService === "melhor_envio" && !activeShippingServices.melhorEnvio) {
      setShippingQuoteState("error");
      setShippingQuoteMessage("Melhor Envio não está habilitado para este tenant.");
      return;
    }

    if (demoMode) {
      const demoAmount = shippingService === "sedex" ? 32.9 : shippingService === "pac" ? 22.4 : 24.7;
      setShippingAmount(demoAmount);
      setIncludeShipping(true);
      setShippingQuoteState("idle");
      setShippingQuoteMessage(`Frete demo calculado: ${brl.format(demoAmount)}.`);
      return;
    }

    try {
      const endpoint = shippingService === "melhor_envio" ? "/api/shipping/melhor-envio/quote" : "/api/shipping/correios";
      const shippingItems = draftItems.map((item) => ({
        productVariantId: item.productVariantId,
        quantity: item.quantity
      }));
      const shippingSubtotal = shippingItems.length > 0 ? draftItemsSubtotal : simulatedResult.subtotal;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productVariantId: variant.id,
          quantity,
          items: shippingItems.length > 0 ? shippingItems : undefined,
          service: shippingService === "sedex" ? "sedex" : "pac",
          originPostalCode: origin,
          destinationPostalCode: destination,
          declaredValue: shippingService === "melhor_envio" && !includeMelhorEnvioInsurance ? 0 : shippingSubtotal,
          insuranceValue: shippingService === "melhor_envio" && includeMelhorEnvioInsurance ? shippingSubtotal : 0
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(formatShippingError(data?.error) || "Não foi possível calcular o frete.");
      }

      const melhorEnvioQuoteOptions = shippingService === "melhor_envio" ? extractMelhorEnvioOptions(data.result) : [];
      if (shippingService === "melhor_envio" && melhorEnvioQuoteOptions.length === 0) {
        throw new Error("O Melhor Envio não retornou opções de frete válidas para esse pacote.");
      }
      const selectedMelhorEnvioOption = melhorEnvioQuoteOptions.find((option) => option.code === selectedMelhorEnvioServiceCode)
        ?? melhorEnvioQuoteOptions[0]
        ?? null;
      const amount = shippingService === "melhor_envio"
        ? selectedMelhorEnvioOption?.price ?? 0
        : Number(data.result?.totalFrete ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("A cotação não retornou valor de frete.");

      setShippingAmount(amount);
      setIncludeShipping(true);
      setShippingPackaging(extractShippingPackaging(data.packaging));
      if (shippingService === "melhor_envio") {
        setMelhorEnvioOptions(melhorEnvioQuoteOptions);
        setSelectedMelhorEnvioServiceCode(selectedMelhorEnvioOption?.code ?? "");
      }
      setShippingQuoteState("idle");
      setShippingQuoteMessage(
        shippingService === "melhor_envio"
          ? `Melhor Envio retornou ${melhorEnvioQuoteOptions.length} opção(ões). Selecionado: ${selectedMelhorEnvioOption?.companyName} - ${selectedMelhorEnvioOption?.name}, ${brl.format(amount)}.`
          : `Frete calculado para ${shippingItems.length > 0 ? "a bandeja de orçamento" : "o item atual"}: ${brl.format(amount)}.`
      );
    } catch (error) {
      setShippingQuoteState("error");
      setShippingQuoteMessage(error instanceof Error ? error.message : "Não foi possível calcular o frete.");
    }
  }

  async function saveCurveVersion() {
    if (readonlyMode || !simulatedChanged || saveState === "saving") return;

    setSaveState("saving");
    const response = await fetch(`/api/products/${variant.id}/curve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ curve: { ...simulatedCurve, platformRuleId: platformKey } })
    });

    if (!response.ok) {
      setSaveState("error");
      return;
    }

    setCurrentCurve(simulatedCurve);
    setSaveState("saved");
    router.refresh();
  }

  async function createQuickQuote() {
    if (demoMode) return `demo-${Date.now()}`;
    assertValidCustomerFields(customerValidation);

    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productVariantId: variant.id,
        platformRuleId: platformKey,
        quantity,
        customerId: null,
        customerName: quickCustomerName.trim() || "Cliente nao informado",
        customerDocument: quickCustomerDocument,
        customerEmail: quickCustomerEmail,
        customerPhone: customerPhoneForQuote,
        customerPostalCode: quickCustomerPostalCode,
        customerAddressLine: quickCustomerAddressLine,
        customerAddressNumber: quickCustomerAddressNumber,
        customerAddressComplement: quickCustomerAddressComplement,
        customerDistrict: quickCustomerDistrict,
        customerCity: quickCustomerCity,
        customerState: quickCustomerState,
        customerExternalOlistId: quickCustomerExternalOlistId,
        pricingCurve: simulatedCurve,
        shippingTotal: includeShipping ? shippingAmount : 0,
        includeCommission,
        includeFixedFee,
        includeSellerShipping,
        platformOverride: buildLocalPlatformOverride({
          localCommissionRate,
          localFixedFee,
          localSellerShippingCost,
          sellerShippingThreshold: platform.sellerShippingThreshold
        }),
        validDays: 7,
        notes: buildQuickQuoteNotes({
          destinationAddress: effectiveDestinationAddress,
          destinationPostalCode: effectiveDestinationPostalCode,
          includeShipping,
          originAddress,
          originPostalCode,
          customerAddressNumber: quickCustomerAddressNumber,
          customerAddressComplement: quickCustomerAddressComplement,
          shippingAmount,
          shippingService: shippingServiceLabel
        })
      })
    });

    if (!response.ok) throw new Error("Quote creation failed.");
    const payload = (await response.json()) as { quote?: { id?: string } };
    const quoteId = payload.quote?.id;
    if (!quoteId) throw new Error("Quote id missing.");
    setLastOlistQuoteId(quoteId);
    return quoteId;
  }

  function addCurrentItemToDraft() {
    if (readonlyMode || !variant || !simulatedResult) return;

    const artworkName = draftArtworkName.trim() || `Arte ${draftItems.length + 1}`;
    setDraftItems((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        productVariantId: variant.id,
        productLabel: `${variant.productName} - ${variant.variantName}`,
        artworkName,
        artworkFile: draftArtworkFile,
        pricingCurve: simulatedCurve,
        quantity,
        unitPrice: simulatedResult.finalUnitPrice,
        totalPrice: simulatedResult.subtotal
      }
    ]);
    setDraftArtworkName(`Arte ${draftItems.length + 2}`);
    setDraftArtworkFile(null);
    setDraftArtworkMessage("");
    setDraftMessage("Item adicionado a bandeja de orcamento.");
    setDraftAttention(true);
    window.setTimeout(() => setDraftAttention(false), 2600);
    setDraftState("idle");
  }

  async function handleArtworkFileChange(file: File | null) {
    setDraftArtworkMessage("");
    if (!file) {
      setDraftArtworkFile(null);
      return;
    }

    if (!isAllowedArtworkMimeType(file.type)) {
      setDraftArtworkFile(null);
      setDraftArtworkMessage("Use PNG, JPG, WebP ou PDF.");
      return;
    }

    if (file.size > MAX_ARTWORK_FILE_SIZE) {
      setDraftArtworkFile(null);
      setDraftArtworkMessage("Arquivo maior que 5 MB.");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setDraftArtworkFile({
      fileName: file.name,
      mimeType: file.type as ArtworkFilePayload["mimeType"],
      fileSize: file.size,
      dataUrl
    });
    setDraftArtworkMessage("Arte anexada para o próximo item.");
  }

  function removeDraftItem(itemId: string) {
    setDraftItems((current) => current.filter((item) => item.id !== itemId));
  }

  async function createDraftQuote() {
    if (draftItems.length === 0) throw new Error("Draft is empty.");
    if (demoMode) return `demo-${Date.now()}`;
    assertValidCustomerFields(customerValidation);

    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platformRuleId: platformKey,
        pricingRule: draftPricingRule,
        items: draftItems.map((item) => ({
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          artworkName: item.artworkName,
          pricingCurve: item.pricingCurve,
          artworkFile: item.artworkFile ?? null
        })),
        customerId: null,
        customerName: quickCustomerName.trim() || "Cliente nao informado",
        customerDocument: quickCustomerDocument,
        customerEmail: quickCustomerEmail,
        customerPhone: customerPhoneForQuote,
        customerPostalCode: quickCustomerPostalCode,
        customerAddressLine: quickCustomerAddressLine,
        customerAddressNumber: quickCustomerAddressNumber,
        customerAddressComplement: quickCustomerAddressComplement,
        customerDistrict: quickCustomerDistrict,
        customerCity: quickCustomerCity,
        customerState: quickCustomerState,
        customerExternalOlistId: quickCustomerExternalOlistId,
        shippingTotal: includeShipping ? shippingAmount : 0,
        includeCommission,
        includeFixedFee,
        includeSellerShipping,
        platformOverride: buildLocalPlatformOverride({
          localCommissionRate,
          localFixedFee,
          localSellerShippingCost,
          sellerShippingThreshold: platform.sellerShippingThreshold
        }),
        validDays: 7,
        notes: [draftNotes, buildQuickQuoteNotes({
          destinationAddress: effectiveDestinationAddress,
          destinationPostalCode: effectiveDestinationPostalCode,
          includeShipping,
          originAddress,
          originPostalCode,
          customerAddressNumber: quickCustomerAddressNumber,
          customerAddressComplement: quickCustomerAddressComplement,
          shippingAmount,
          shippingService: shippingServiceLabel
        })].filter(Boolean).join("\n\n")
      })
    });

    if (!response.ok) throw new Error("Composite quote creation failed.");
    const payload = (await response.json()) as { quote?: { id?: string } };
    const quoteId = payload.quote?.id;
    if (!quoteId) throw new Error("Quote id missing.");
    setLastOlistQuoteId(quoteId);
    return quoteId;
  }

  async function createDraftOnly() {
    if (readonlyMode || draftState === "creating") return;

    setDraftState("creating");
    setDraftMessage("");
    setDraftText("");

    try {
      const quoteId = await createDraftQuote();
      setDraftState("idle");
      if (demoMode) {
        setDraftMessage("Orcamento demo criado. Use PDF ou WhatsApp para exportar.");
      } else {
        setDraftMessage("Orcamento composto criado.");
        setDraftItems([]);
        router.refresh();
        window.location.href = `/quotes/${quoteId}`;
      }
    } catch {
      setDraftState("error");
      setDraftMessage("Nao foi possivel criar o orcamento composto.");
    }
  }

  async function generateDraftPdf() {
    if (readonlyMode || draftState === "creating_pdf") return;

    setDraftState("creating_pdf");
    setDraftMessage("");
    setDraftText("");
    const pdfWindow = window.open("about:blank", "_blank");

    try {
      const quoteId = await createDraftQuote();
      if (demoMode) {
        writeDemoPdfWindow(pdfWindow, buildDemoQuoteDocument({
          customerName: quickCustomerName,
          items: draftItems,
          quoteId,
          shippingTotal: includeShipping ? shippingAmount : 0,
          title: "Orcamento demo composto"
        }));
      } else {
        const pdfUrl = `/api/quotes/${quoteId}/pdf`;
        if (pdfWindow) {
          pdfWindow.location.href = pdfUrl;
        } else {
          window.location.href = pdfUrl;
        }
      }
      setDraftState("idle");
      setDraftMessage(demoMode ? "PDF demo aberto para impressao/salvar." : "Orcamento composto criado e PDF gerado. Os itens foram mantidos na bandeja.");
      router.refresh();
    } catch {
      pdfWindow?.close();
      setDraftState("error");
      setDraftMessage("Nao foi possivel gerar o PDF composto.");
    }
  }

  async function copyDraftWhatsAppText() {
    if (readonlyMode || draftState === "copying_text") return;

    setDraftState("copying_text");
    setDraftMessage("");
    setDraftText("");

    try {
      const quoteId = await createDraftQuote();
      let text = "";
      if (demoMode) {
        text = buildDemoWhatsAppText({
          customerName: quickCustomerName,
          items: draftItems,
          quoteId,
          shippingTotal: includeShipping ? shippingAmount : 0,
          title: "Orcamento demo composto"
        });
      } else {
        const response = await fetch(`/api/quotes/${quoteId}/whatsapp`);
        if (!response.ok) throw new Error("WhatsApp text failed.");
        const payload = (await response.json()) as { text?: string };
        if (!payload.text) throw new Error("WhatsApp text missing.");
        text = payload.text;
      }
      setDraftText(text);
      try {
        await navigator.clipboard.writeText(text);
        setDraftMessage("Texto do orcamento composto copiado para o WhatsApp.");
      } catch {
        setDraftMessage("Orcamento criado. Nao foi possivel copiar automaticamente; use o texto abaixo.");
      }
      setDraftState("copied");
      router.refresh();
    } catch {
      setDraftState("error");
      setDraftMessage("Nao foi possivel criar/copiar o texto composto. Os itens foram mantidos na bandeja.");
    }
  }

  async function generateQuickPdf() {
    if (quoteActionsDisabled || customerHasValidationErrors || quickState === "creating_pdf") return;

    if (!simulatedResult) return;
    const demoItem = currentDemoItem(variant, quantity, simulatedResult.finalUnitPrice, simulatedResult.subtotal, draftArtworkName, simulatedCurve);
    setQuickState("creating_pdf");
    setQuickMessage("");
    setQuickText("");
    const pdfWindow = window.open("about:blank", "_blank");

    try {
      const quoteId = await createQuickQuote();
      if (demoMode) {
        writeDemoPdfWindow(pdfWindow, buildDemoQuoteDocument({
          customerName: quickCustomerName,
          items: [demoItem],
          quoteId,
          shippingTotal: includeShipping ? shippingAmount : 0,
          title: "Orcamento demo rapido"
        }));
      } else {
        const pdfUrl = `/api/quotes/${quoteId}/pdf`;
        if (pdfWindow) {
          pdfWindow.location.href = pdfUrl;
        } else {
          window.location.href = pdfUrl;
        }
      }
      setQuickState("idle");
      setQuickMessage(demoMode ? "PDF demo aberto para impressao/salvar." : "Orcamento criado e PDF gerado.");
      router.refresh();
    } catch {
      pdfWindow?.close();
      setQuickState("error");
      setQuickMessage("Nao foi possivel gerar o PDF.");
    }
  }

  async function copyQuickWhatsAppText() {
    if (quoteActionsDisabled || customerHasValidationErrors || quickState === "copying_text") return;

    if (!simulatedResult) return;
    const demoItem = currentDemoItem(variant, quantity, simulatedResult.finalUnitPrice, simulatedResult.subtotal, draftArtworkName, simulatedCurve);
    setQuickState("copying_text");
    setQuickMessage("");
    setQuickText("");

    try {
      const quoteId = await createQuickQuote();
      const text = demoMode
        ? buildDemoWhatsAppText({
            customerName: quickCustomerName,
            items: [demoItem],
            quoteId,
            shippingTotal: includeShipping ? shippingAmount : 0,
            title: "Orcamento demo rapido"
          })
        : await fetchQuoteWhatsAppText(quoteId);
      setQuickText(text);
      await navigator.clipboard.writeText(text);
      setQuickState("copied");
      setQuickMessage("Texto do orcamento copiado para o WhatsApp.");
      router.refresh();
    } catch {
      setQuickState("error");
      setQuickMessage("Nao foi possivel copiar o texto.");
    }
  }

  return (
    <>
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl shadow-zinc-950/20">
      <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-4 sm:px-5 sm:py-5 md:px-6">
        <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-start">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-400">
              <Calculator size={18} />
              Precificador
            </div>
            <h2 className="break-words text-xl font-semibold text-white sm:text-2xl">{variant.productName}</h2>
            <p className="mt-1 break-words text-sm text-zinc-400">
              {variant.variantName} · custo {brl.format(variant.unitCost)} · {platform.name}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:w-[520px]">
            <button
              className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              disabled={quoteActionsDisabled || customerHasValidationErrors || quickState === "creating_pdf"}
              type="button"
              onClick={generateQuickPdf}
            >
              <FileText size={16} />
              {quickState === "creating_pdf" ? "Gerando..." : "Gerar PDF"}
            </button>
            <button
              className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-500"
              disabled={quoteActionsDisabled || customerHasValidationErrors || quickState === "copying_text"}
              type="button"
              onClick={copyQuickWhatsAppText}
            >
              <Clipboard size={16} />
              {quickState === "copying_text" ? "Copiando..." : "Copiar WhatsApp"}
            </button>
            <button
              className={[
                "focus-ring relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-md border px-4 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500 sm:col-span-2",
                draftAttention
                  ? "animate-pulse border-amber-300 bg-amber-400/15 text-amber-50 shadow-lg shadow-amber-500/30"
                  : "border-amber-400/40 text-amber-100 hover:bg-amber-400/10"
              ].join(" ")}
              disabled={readonlyMode}
              type="button"
              onClick={() => setDraftOpen(true)}
            >
              {draftAttention ? <span className="absolute inset-0 bg-amber-300/10" /> : null}
              <ShoppingCart size={16} />
              <span className="relative">Bandeja de orcamento</span>
              <span className="relative rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-zinc-950 ring-2 ring-amber-200/20">
                {draftItems.length}
              </span>
            </button>
          </div>
        </div>

        {simulatedChanged ? (
          <p className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            Salve a curva simulada antes de gerar orcamento, PDF ou texto para WhatsApp.
          </p>
        ) : null}
        {quickMessage ? (
          <p className={`mt-4 text-sm ${quickState === "error" ? "text-red-300" : "text-emerald-300"}`}>
            {quickMessage}
          </p>
        ) : null}
        {draftMessage && !draftOpen ? (
          <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${draftState === "error" ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>
            {draftMessage}
          </p>
        ) : null}
        {quickText ? (
          <textarea
            className="focus-ring mt-3 min-h-32 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            readOnly
            value={quickText}
          />
        ) : null}
        {!demoMode && !readonlyMode && lastOlistQuoteId ? (
          <div className="mt-4">
            <OlistQuoteActions
              hasCustomer
              quoteId={lastOlistQuoteId}
            />
            <a
              className="mt-3 inline-flex text-xs font-medium text-cyan-300 hover:text-cyan-200"
              href={`/quotes/${lastOlistQuoteId}`}
            >
              Abrir orçamento completo
            </a>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 p-4 sm:p-5 md:p-6">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_180px]">
          <Control label="Produto">
            <select
              className="focus-ring h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
            >
              {variants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.productName} - {item.variantName}
                </option>
              ))}
            </select>
          </Control>

          <Control label="Canal">
            <select
              className="focus-ring h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
              value={platformKey}
              onChange={(event) => setPlatformKey(event.target.value)}
            >
              {Object.entries(platforms).map(([key, rule]) => (
                <option key={key} value={key}>
                  {rule.name}
                </option>
              ))}
            </select>
          </Control>

          <Control label="Quantidade">
            <input
              className="focus-ring h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
              min={1}
              max={50000}
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </Control>
        </div>

        <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 lg:grid-cols-[minmax(220px,1fr)_minmax(280px,1fr)_max-content] lg:items-start">
          <div>
            <Input
              label="Arte/lote para orcamento composto"
              placeholder="Ex.: Logo azul, Arte cliente A"
              value={draftArtworkName}
              onChange={setDraftArtworkName}
            />
          </div>
          <div className="min-w-0">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Arquivo da arte</span>
            <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-2">
              {draftArtworkFile?.dataUrl.startsWith("data:image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="h-7 w-7 shrink-0 rounded border border-zinc-800 object-cover"
                  src={draftArtworkFile.dataUrl}
                />
              ) : (
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 text-zinc-500">
                  <ImageIcon size={15} />
                </span>
              )}
              <label className="focus-ring inline-flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
                <Upload size={14} />
                {draftArtworkFile ? "Trocar" : "Anexar"}
                <input
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="sr-only"
                  type="file"
                  onChange={(event) => void handleArtworkFileChange(event.target.files?.[0] ?? null)}
                />
              </label>
              {draftArtworkFile ? (
                <button
                  className="focus-ring ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  type="button"
                  onClick={() => {
                    setDraftArtworkFile(null);
                    setDraftArtworkMessage("");
                  }}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <p className={`mt-1 truncate text-xs ${draftArtworkMessage.startsWith("Arquivo") || draftArtworkMessage.startsWith("Use") ? "text-amber-300" : "text-zinc-500"}`}>
              {draftArtworkMessage || (draftArtworkFile ? `${draftArtworkFile.fileName} · ${formatBytes(draftArtworkFile.fileSize)}` : "Opcional, até 5 MB.")}
            </p>
          </div>
          <div>
            <span className="mb-1 hidden text-xs font-medium uppercase tracking-wide text-transparent lg:block">Ação</span>
            <button
              className="focus-ring inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 lg:w-auto"
              disabled={readonlyMode || (simulatedChanged && !demoMode)}
              type="button"
              onClick={addCurrentItemToDraft}
            >
              <Plus size={16} />
              Adicionar ao orçamento
            </button>
          </div>
        </div>

        <DetailsPanel icon={<UserRound size={16} />} title="Informacoes do Cliente">
          <div className="mb-4 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-cyan-50">Buscar cliente no Olist</h4>
                <p className="mt-1 text-xs leading-5 text-cyan-100/75">
                  Encontre por nome, CPF/CNPJ, telefone ou e-mail e preencha automaticamente os dados do orçamento.
                </p>
              </div>
              <span className="rounded-full bg-zinc-950/50 px-2.5 py-1 text-xs text-cyan-100">
                {olistCustomerResults.length ? `${olistCustomerResults.length} resultado(s)` : "Opcional"}
              </span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[170px_minmax(0,1fr)_auto] lg:items-end">
              <Control label="Pesquisar por">
                <select
                  className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm"
                  value={olistCustomerLookupMode}
                  onChange={(event) => setOlistCustomerLookupMode(event.target.value as OlistCustomerLookupMode)}
                >
                  <option value="auto">Automático</option>
                  <option value="nome">Nome</option>
                  <option value="cpfCnpj">CPF/CNPJ</option>
                  <option value="celular">Telefone</option>
                  <option value="email">E-mail</option>
                  <option value="codigo">Código</option>
                </select>
              </Control>
              <Input
                label="Valor da busca"
                placeholder="Ex.: Angelita, 000.000.000-00 ou (11) 99999-9999"
                value={olistCustomerLookupTerm}
                onChange={setOlistCustomerLookupTerm}
              />
              <button
                className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-zinc-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                disabled={demoMode || readonlyMode || olistCustomerLookupState === "loading"}
                onClick={lookupOlistCustomer}
                type="button"
              >
                <Search size={16} />
                {olistCustomerLookupState === "loading" ? "Buscando..." : "Buscar"}
              </button>
            </div>
            {!olistCustomerLookupTerm.trim() ? (
              <p className="mt-2 text-xs text-cyan-100/60">
                Se deixar vazio, a busca usa os dados já digitados abaixo, priorizando CPF/CNPJ, telefone, e-mail e nome.
              </p>
            ) : null}
            {olistCustomerLookupMessage ? (
              <p className={`mt-3 rounded-md px-3 py-2 text-xs ${olistCustomerLookupState === "error" ? "bg-rose-400/10 text-rose-100" : "bg-zinc-950/50 text-cyan-100"}`}>
                {olistCustomerLookupMessage}
              </p>
            ) : null}
            {olistCustomerResults.length ? (
              <div className="mt-3 grid gap-2">
                {olistCustomerResults.map((customer, index) => (
                  <button
                    className="focus-ring rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-left hover:border-cyan-300/40 hover:bg-zinc-950"
                    key={`${customer.id || customer.code || customer.name}-${index}`}
                    onClick={() => applyOlistCustomer(customer)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-white">{customer.name || "Cliente sem nome"}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {[customer.document, customer.email, customer.phone].filter(Boolean).join(" · ") || "Sem documento/e-mail/telefone no retorno"}
                        </p>
                      </div>
                      <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-100">Usar cliente</span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      {[customer.addressLine, customer.addressNumber, customer.district, customer.city, customer.state, customer.postalCode]
                        .filter(Boolean)
                        .join(", ") || "Sem endereço no retorno"}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Nome (cliente)" placeholder="Insira o nome do cliente" value={quickCustomerName} onChange={setQuickCustomerName} />
            <Input
              helper={customerValidation.documentType ? `Identificado como ${customerValidation.documentType === "cpf" ? "Pessoa Física" : "Pessoa Jurídica"}.` : "Digite CPF ou CNPJ; o tipo é identificado automaticamente."}
              error={customerValidation.errors.document}
              label="CPF/CNPJ"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={quickCustomerDocument}
              onChange={(value) => setQuickCustomerDocument(formatCpfCnpj(String(value)))}
            />
            <Input
              error={customerValidation.errors.email}
              label="Email"
              placeholder="cliente@email.com"
              type="email"
              value={quickCustomerEmail}
              onChange={setQuickCustomerEmail}
            />
            <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
              <Input
                error={customerValidation.errors.phoneDdi}
                label="DDI"
                placeholder="+55"
                value={quickCustomerPhoneDdi}
                onChange={(value) => setQuickCustomerPhoneDdi(formatDdi(String(value)))}
              />
              <Input
                error={customerValidation.errors.phone}
                helper="Aceita fixo com DDD ou celular com DDD."
                label="Telefone"
                placeholder="(11) 99999-9999"
                value={quickCustomerPhone}
                onChange={(value) => setQuickCustomerPhone(formatBrazilPhone(String(value)))}
              />
            </div>
          </div>
          {quickCustomerExternalOlistId ? (
            <p className="mt-3 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
              Cliente vinculado ao Olist/Tiny: ID {quickCustomerExternalOlistId}. Esse vínculo será salvo no orçamento criado.
            </p>
          ) : null}
          {customerHasValidationErrors ? (
            <p className="mt-3 rounded-md border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
              Corrija CPF/CNPJ, e-mail ou telefone antes de gerar orçamento, PDF ou texto para WhatsApp.
            </p>
          ) : null}
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <h4 className="mb-3 text-sm font-semibold text-zinc-300">Endereço do cliente</h4>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="md:col-span-2">
                <Input
                  label="CEP"
                  placeholder="00000-000"
                  value={quickCustomerPostalCode}
                  onBlur={lookupCustomerCep}
                  onChange={(value) => {
                    setQuickCustomerPostalCode(formatCep(String(value)));
                    setQuickCustomerAddress(null);
                  }}
                />
              </div>
              <div className="md:col-span-4">
                <Input label="Endereço" value={quickCustomerAddressLine} onChange={setQuickCustomerAddressLine} />
              </div>
              <div className="md:col-span-2">
                <Input label="Número" value={quickCustomerAddressNumber} onChange={setQuickCustomerAddressNumber} />
              </div>
              <div className="md:col-span-4">
                <Input label="Complemento" value={quickCustomerAddressComplement} onChange={setQuickCustomerAddressComplement} />
              </div>
              <div className="md:col-span-3">
                <Input label="Bairro" value={quickCustomerDistrict} onChange={setQuickCustomerDistrict} />
              </div>
              <div className="md:col-span-2">
                <Input label="Cidade" value={quickCustomerCity} onChange={setQuickCustomerCity} />
              </div>
              <div className="md:col-span-1">
                <Input label="UF" value={quickCustomerState} onChange={(value) => setQuickCustomerState(String(value).toUpperCase())} />
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Se o CEP do cliente estiver preenchido, ele será usado como destino padrão no cálculo/observação do frete.
            </p>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Se vazio, entra como cliente nao informado no orcamento rapido.</p>
        </DetailsPanel>

        <DetailsPanel icon={<Truck size={16} />} title="Frete e calculo">
          <div className="grid gap-4 md:grid-cols-5">
            <Input
              label="CEP destino"
              placeholder={effectiveDestinationPostalCode ? "Usando CEP do cliente" : "00000-000"}
              value={destinationPostalCode}
              onBlur={() => lookupShippingCep("destination")}
              onChange={(value) => {
                setDestinationPostalCode(formatCep(String(value)));
                setDestinationAddress(null);
              }}
            />
            <Input
              label="CEP origem"
              placeholder="Usa padrão configurado"
              value={originPostalCode}
              onBlur={() => lookupShippingCep("origin")}
              onChange={(value) => {
                setOriginPostalCode(formatCep(String(value)));
                setOriginAddress(null);
              }}
            />
            <Control label="Servico">
              <select
                className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm"
                value={shippingService}
                onChange={(event) => {
                  setShippingService(event.target.value as ShippingServiceOption);
                  setShippingQuoteMessage("");
                }}
              >
                {activeShippingServices.correios ? (
                  <>
                    <option value="sedex">SEDEX</option>
                    <option value="pac">PAC</option>
                  </>
                ) : null}
                {activeShippingServices.melhorEnvio ? <option value="melhor_envio">Melhor Envio</option> : null}
                <option value="manual">Outros/manual</option>
              </select>
            </Control>
            <Input label="Frete estimado (R$)" min={0} step={0.01} type="number" value={shippingAmount} onChange={setShippingAmount} />
            <div className="flex flex-col justify-end gap-2">
              <button
                className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-cyan-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                disabled={shippingQuoteState === "loading"}
                type="button"
                onClick={calculateShipping}
              >
                <Truck size={16} />
                {shippingQuoteState === "loading" ? "Calculando..." : "Calcular frete"}
              </button>
              <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-300">
                <input
                  checked={includeShipping}
                  className="h-4 w-4 accent-amber-500"
                  type="checkbox"
                  onChange={(event) => setIncludeShipping(event.target.checked)}
                />
                Somar frete ao orcamento
              </label>
            </div>
          </div>
          {shippingService === "melhor_envio" && melhorEnvioOptions.length > 0 ? (
            <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <Control label="Opção do Melhor Envio">
                  <select
                    className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
                    value={selectedMelhorEnvioServiceCode}
                    onChange={(event) => {
                      const option = melhorEnvioOptions.find((item) => item.code === event.target.value);
                      setSelectedMelhorEnvioServiceCode(event.target.value);
                      if (option) {
                        setShippingAmount(option.price);
                        setIncludeShipping(true);
                        setShippingQuoteMessage(`Opção selecionada: ${option.companyName} - ${option.name}, ${brl.format(option.price)}.`);
                      }
                    }}
                  >
                    {melhorEnvioOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.companyName} - {option.name} · {brl.format(option.price)}
                        {option.deliveryTime ? ` · ${option.deliveryTime} dia(s)` : ""}
                      </option>
                    ))}
                  </select>
                </Control>
                <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300">
                  <span className="block text-xs uppercase tracking-wide text-cyan-200/70">Opções retornadas</span>
                  <strong className="mt-1 block text-zinc-100">{melhorEnvioOptions.length}</strong>
                </div>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Recalcule o frete para atualizar prazos e valores. A opção escolhida é a que entra no orçamento.
              </p>
            </div>
          ) : null}
          <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
            Base do cálculo:{" "}
            <strong className="text-zinc-100">
              {draftItems.length > 0
                ? `Bandeja de orçamento (${draftItems.length} item${draftItems.length === 1 ? "" : "s"})`
                : `Item atual da tela (${quantity} un.)`}
            </strong>
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            Total com frete: {brl.format((draftItems.length > 0 ? draftItemsSubtotal : simulatedResult.subtotal) + (includeShipping ? shippingAmount : 0))}
          </p>
          {shippingPackaging ? (
            <div className="mt-3 grid gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="block text-xs uppercase tracking-wide text-cyan-200/70">Caixa usada</span>
                <strong className="mt-1 block text-zinc-100">{shippingPackaging.boxName}</strong>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-cyan-200/70">Dimensões</span>
                <strong className="mt-1 block text-zinc-100">
                  {formatCm(shippingPackaging.widthCm)} x {formatCm(shippingPackaging.lengthCm)} x {formatCm(shippingPackaging.heightCm)} cm
                </strong>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-cyan-200/70">Peso do frete</span>
                <strong className="mt-1 block text-zinc-100">
                  {formatKg(shippingPackaging.grossWeightPerBoxKg)} por caixa
                </strong>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-cyan-200/70">Volumes</span>
                <strong className="mt-1 block text-zinc-100">
                  {shippingPackaging.boxesNeeded} caixa{shippingPackaging.boxesNeeded === 1 ? "" : "s"}
                </strong>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <span className="text-xs text-zinc-500">
                  Capacidade estimada: {shippingPackaging.capacity} un. por caixa · peso total: {formatKg(shippingPackaging.grossWeightKg)} · peso da caixa vazia: {formatKg(shippingPackaging.boxWeightKg)}
                </span>
              </div>
            </div>
          ) : null}
          {shippingService === "melhor_envio" ? (
            <label className="mt-3 flex w-fit items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-300">
              <input
                checked={includeMelhorEnvioInsurance}
                className="h-4 w-4 accent-cyan-400"
                type="checkbox"
                onChange={(event) => setIncludeMelhorEnvioInsurance(event.target.checked)}
              />
              Incluir seguro do Melhor Envio sobre {brl.format(draftItems.length > 0 ? draftItemsSubtotal : simulatedResult.subtotal)}
            </label>
          ) : null}
          {!activeShippingServices.correios && !activeShippingServices.melhorEnvio ? (
            <p className="mt-2 text-xs text-zinc-500">
              Nenhuma integração automática de frete está ativa. Use Outros/manual ou configure Melhor Envio/Correios.
            </p>
          ) : null}
          {shippingQuoteMessage ? (
            <p className={`mt-2 text-xs ${shippingQuoteState === "error" ? "text-red-300" : "text-emerald-300"}`}>
              {shippingQuoteMessage}
            </p>
          ) : null}
          {cepLookupMessage ? <p className="mt-2 text-xs text-zinc-500">{cepLookupMessage}</p> : null}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <CepPreview label={effectiveDestinationPostalCode === quickCustomerPostalCode ? "Destino (cliente)" : "Destino"} address={effectiveDestinationAddress} />
            <CepPreview label="Origem" address={originAddress} />
          </div>
        </DetailsPanel>

        <DetailsPanel icon={<Activity size={16} />} title="Ancoragem de precos & Custos">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 p-1">
              <button
                className={`rounded px-3 py-1.5 text-sm ${simulatedCurve.mode === "interpolated" ? "bg-amber-500 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}
                type="button"
                onClick={() => updateCurveMode("interpolated")}
              >
                Curva progressiva
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm ${simulatedCurve.mode === "step" ? "bg-amber-500 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}
                type="button"
                onClick={() => updateCurveMode("step")}
              >
                Preco por faixa
              </button>
            </div>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              type="button"
              onClick={smoothAnchors}
              disabled={simulatedCurve.mode === "step"}
            >
              <Activity size={16} />
              Recalcular intermediarios
            </button>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              type="button"
              onClick={addCurvePoint}
            >
              <Plus size={16} />
              Adicionar ponto
            </button>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              type="button"
              onClick={resetAnchors}
            >
              <RotateCcw size={16} />
              Resetar curva
            </button>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              disabled={persistentActionsDisabled || !simulatedChanged || saveState === "saving"}
              type="button"
              onClick={saveCurveVersion}
            >
              <Save size={16} />
              {saveState === "saving" ? "Salvando..." : "Salvar nova versao"}
            </button>
          </div>
          <div className="grid gap-2">
            {simulatedCurve.points.map((point, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2" key={`${point.quantity}-${index}`}>
                <Input
                  label={index === 0 ? "Quantidade inicial" : "Quantidade"}
                  min={1}
                  step={1}
                  type="number"
                  value={point.quantity}
                  onChange={(value) => updateCurvePoint(index, "quantity", value)}
                />
                <Input
                  label={index === 0 ? "Preco unitario" : "Preco"}
                  min={0}
                  step={0.01}
                  type="number"
                  value={point.unitPrice}
                  onChange={(value) => updateCurvePoint(index, "unitPrice", value)}
                />
                <button
                  className="focus-ring mt-6 inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={simulatedCurve.points.length <= 1}
                  title="Remover ponto"
                  type="button"
                  onClick={() => removeCurvePoint(index)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Em curva progressiva, o sistema interpola todos os pontos entre duas quantidades. Em preco por faixa, o valor fica fixo ate o proximo ponto.
          </p>
          {simulatedChanged ? (
            <p className="mt-3 rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              A curva foi alterada apenas para este atendimento. Ela já será usada ao adicionar itens na bandeja, calcular frete por valor declarado e criar orçamento, PDF ou WhatsApp. Salvar nova versão é opcional e altera o produto definitivamente.
            </p>
          ) : null}
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <EditableCostToggle
              checked={includeCommission}
              label="Comissao"
              suffix="%"
              value={Number((localCommissionRate * 100).toFixed(2))}
              onChange={setIncludeCommission}
              onValueChange={(value) => setLocalCommissionRate(Math.max(0, Math.min(99, value)) / 100)}
            />
            <EditableCostToggle
              checked={includeFixedFee}
              label="Taxa fixa"
              prefix="R$"
              value={localFixedFee}
              onChange={setIncludeFixedFee}
              onValueChange={(value) => setLocalFixedFee(Math.max(0, value))}
            />
            <EditableCostToggle
              checked={includeSellerShipping}
              label="Frete vendedor"
              prefix="R$"
              value={localSellerShippingCost}
              onChange={setIncludeSellerShipping}
              onValueChange={(value) => setLocalSellerShippingCost(Math.max(0, value))}
            />
            <ReadOnlyField label="Limite frete vendedor" value={brl.format(platform.sellerShippingThreshold)} />
          </div>
          <p className="mt-3 rounded-md border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs text-sky-100">
            Estes ajustes valem apenas para a simulacao/orcamento atual. Para alterar definitivamente, edite o canal em Configuracoes &gt; Canais.
          </p>
          {saveState === "saved" ? <p className="mt-3 text-sm text-emerald-300">Nova curva ativa salva.</p> : null}
          {saveState === "error" ? <p className="mt-3 text-sm text-red-300">Nao foi possivel salvar a curva.</p> : null}
        </DetailsPanel>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric icon={<CircleDollarSign size={18} />} label="Preco unitario" tone="amber" value={brl.format(simulatedResult.finalUnitPrice)} />
          <Metric label="Taxa fixa" value={brl.format(simulatedResult.fixedFeeTotal)} />
          <Metric label="Preco total" value={brl.format(simulatedResult.subtotal)} />
          <Metric label="Margem liquida" value={brl.format(simulatedResult.profit)} tone="emerald" />
          <Metric label="Custo total" value={brl.format(simulatedResult.totalCost)} />
          <Metric
            icon={<TrendingUp size={18} />}
            label="Margem (%)"
            value={`${percent.format(simulatedResult.marginPercent)}%`}
            tone={simulatedResult.marginPercent >= 0 ? "emerald" : "red"}
          />
        </div>

        <ChartPanel title="Curva de precos com custos" subtitle="Calculada para cada unidade entre 1 e 1000. Passe o mouse para ver quantidade, base e preco final.">
          <LineChart
            anchors={simulatedCurve.points.map((point) => point.quantity)}
            current={pricingCurvePoints(currentCurve, variant.unitCost, effectivePlatform)}
            formatValue={(value) => brl.format(value)}
            mode={simulatedCurve.mode}
            simulated={pricingCurvePoints(simulatedCurve, variant.unitCost, effectivePlatform)}
          />
        </ChartPanel>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h3 className="font-semibold text-white">Faixas de quantidade</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[640px] divide-y divide-zinc-800 text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Qtd</th>
                    <th className="px-4 py-3 font-semibold">Atual</th>
                    <th className="px-4 py-3 font-semibold">Simulado</th>
                    <th className="px-4 py-3 font-semibold">Margem</th>
                    <th className="px-4 py-3 font-semibold">Lucro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {simulatedSeries.map((point, index) => (
                    <tr key={point.quantity}>
                      <td className="px-4 py-3 font-medium text-white">{point.label}</td>
                      <td className="px-4 py-3 text-zinc-300">{brl.format(currentSeries[index].finalUnitPrice)}</td>
                      <td className="px-4 py-3 text-emerald-300">{brl.format(point.finalUnitPrice)}</td>
                      <td className="px-4 py-3 text-zinc-300">{percent.format(point.marginPercent)}%</td>
                      <td className="px-4 py-3 text-zinc-300">{brl.format(point.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
            <h3 className="font-semibold text-white">Resumo do calculo</h3>
            <dl className="mt-4 grid gap-3 text-sm">
              <Detail label="Base atual" value={brl.format(currentResult.baseUnitPrice)} />
              <Detail label="Base simulada" value={brl.format(simulatedResult.baseUnitPrice)} />
              <Detail label="Comissao" value={brl.format(simulatedResult.commissionTotal)} />
              <Detail label="Taxa fixa" value={brl.format(simulatedResult.fixedFeeTotal)} />
              <Detail label="Frete vendedor" value={brl.format(simulatedResult.sellerShippingTotal)} />
              <Detail label="Frete cliente" value={includeShipping ? brl.format(shippingAmount) : brl.format(0)} />
              <Detail label="Custo mercadoria" value={brl.format(simulatedResult.costOfGoodsTotal)} />
              <Detail label="Lucro liquido" value={brl.format(simulatedResult.profit)} />
            </dl>
            <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Diferenca na quantidade atual</p>
              <p className="mt-2 text-sm text-zinc-300">
                Unitario: <span className={deltaClass(selectedComparison.unitPriceDelta)}>{formatDeltaMoney(selectedComparison.unitPriceDelta)}</span>
              </p>
              <p className="mt-1 text-sm text-zinc-300">
                Margem: <span className={deltaClass(selectedComparison.marginDelta)}>{formatDeltaPercent(selectedComparison.marginDelta)}</span>
              </p>
            </div>
          </section>
        </div>

        {demoMode || readonlyMode ? (
          <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            {demoMode
              ? "Demo com dados ficticios. Voce pode testar PDF e WhatsApp sem salvar dados reais."
              : "Demo com dados ficticios. Custos e curvas reais ficam protegidos apos login."}
          </p>
        ) : null}
      </div>
    </section>
    <QuoteDraftDrawer
      draftEstimatedTotal={draftEstimatedTotal}
      draftItems={draftItems}
      draftMessage={draftMessage}
      draftNotes={draftNotes}
      draftOpen={draftOpen}
      draftPricingRule={draftPricingRule}
      draftState={draftState}
      draftText={draftText}
      includeShipping={includeShipping}
      invalidCustomerFields={customerHasValidationErrors}
      onClose={() => setDraftOpen(false)}
      onCopyWhatsApp={copyDraftWhatsAppText}
      onCreateQuote={createDraftOnly}
      onGeneratePdf={generateDraftPdf}
      onPricingRuleChange={setDraftPricingRule}
      onClearItems={() => setDraftItems([])}
      onRemoveItem={removeDraftItem}
      onUpdateNotes={setDraftNotes}
      shippingAmount={shippingAmount}
    />
    </>
  );
}

function QuoteDraftDrawer({
  draftEstimatedTotal,
  draftItems,
  draftMessage,
  draftNotes,
  draftOpen,
  draftPricingRule,
  draftState,
  draftText,
  includeShipping,
  invalidCustomerFields,
  onClose,
  onCopyWhatsApp,
  onCreateQuote,
  onGeneratePdf,
  onPricingRuleChange,
  onClearItems,
  onRemoveItem,
  onUpdateNotes,
  shippingAmount
}: {
  draftEstimatedTotal: number;
  draftItems: DraftQuoteItem[];
  draftMessage: string;
  draftNotes: string;
  draftOpen: boolean;
  draftPricingRule: DraftPricingRule;
  draftState: "idle" | "creating" | "creating_pdf" | "copying_text" | "copied" | "error";
  draftText: string;
  includeShipping: boolean;
  invalidCustomerFields: boolean;
  onClose: () => void;
  onCopyWhatsApp: () => void;
  onCreateQuote: () => void;
  onGeneratePdf: () => void;
  onPricingRuleChange: (rule: DraftPricingRule) => void;
  onClearItems: () => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateNotes: (value: string) => void;
  shippingAmount: number;
}) {
  if (!draftOpen) return null;

  const disabled = invalidCustomerFields || draftItems.length === 0 || ["creating", "creating_pdf", "copying_text"].includes(draftState);

  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/70" aria-label="Fechar bandeja" type="button" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl shadow-black/40 sm:w-[520px]">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-4 py-4">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-amber-400">
              <ShoppingCart size={16} />
              Bandeja de orcamento
            </p>
            <h3 className="mt-1 text-xl font-semibold text-white">{draftItems.length} item(ns)</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="focus-ring inline-flex h-9 items-center justify-center rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              disabled={draftItems.length === 0}
              type="button"
              onClick={onClearItems}
            >
              Limpar
            </button>
            <button
              className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              type="button"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="grid gap-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-sm font-medium text-white">Regra de cobranca</p>
              <div className="mt-3 grid gap-2">
                <DraftRuleButton
                  active={draftPricingRule === "per_item"}
                  description="Cada item usa sua propria quantidade para buscar o preco."
                  label="Por item individual"
                  onClick={() => onPricingRuleChange("per_item")}
                />
                <DraftRuleButton
                  active={draftPricingRule === "per_art_average"}
                  description="Soma o mesmo produto, divide pelo numero de artes e usa essa quantidade como referencia."
                  label="Por artes do mesmo produto"
                  onClick={() => onPricingRuleChange("per_art_average")}
                />
                <DraftRuleButton
                  active={draftPricingRule === "aggregate_total"}
                  description="Soma o mesmo produto e usa o total como referencia para todas as artes."
                  label="Por total do mesmo produto"
                  onClick={() => onPricingRuleChange("aggregate_total")}
                />
              </div>
            </div>

            <div className="grid gap-2">
              {draftItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
                  Adicione itens pelo precificador para montar um orcamento composto.
                </p>
              ) : (
                draftItems.map((item) => (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3" key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-white">{item.productLabel}</p>
                        <p className="mt-1 text-xs text-zinc-500">Arte: {item.artworkName}</p>
                        {item.artworkFile ? (
                          <div className="mt-2 flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-1.5">
                            {item.artworkFile.dataUrl.startsWith("data:image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                alt=""
                                className="h-9 w-9 shrink-0 rounded border border-zinc-800 object-cover"
                                src={item.artworkFile.dataUrl}
                              />
                            ) : (
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-zinc-800 text-zinc-500">
                                <FileText size={15} />
                              </span>
                            )}
                            <span className="min-w-0 truncate text-xs text-zinc-400">
                              {item.artworkFile.fileName} · {formatBytes(item.artworkFile.fileSize)}
                            </span>
                          </div>
                        ) : null}
                        <p className="mt-1 text-xs text-zinc-400">
                          {item.quantity} x {brl.format(item.unitPrice)}
                        </p>
                      </div>
                      <button
                        className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <p className="mt-2 text-right text-sm font-semibold text-white">{brl.format(item.totalPrice)}</p>
                  </div>
                ))
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Observacoes</span>
              <textarea
                className="focus-ring min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                value={draftNotes}
                onChange={(event) => onUpdateNotes(event.target.value)}
              />
            </label>

            {draftText ? (
              <textarea
                className="focus-ring min-h-32 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                readOnly
                value={draftText}
              />
            ) : null}
          </div>
        </div>

        <div className="border-t border-zinc-800 px-4 py-4">
          <dl className="mb-3 grid gap-2 text-sm">
            <Detail label="Itens estimados" value={brl.format(draftItems.reduce((sum, item) => sum + item.totalPrice, 0))} />
            <Detail label="Frete cliente" value={includeShipping ? brl.format(shippingAmount) : brl.format(0)} />
            <Detail label="Total estimado" value={brl.format(draftEstimatedTotal)} />
          </dl>
          {draftMessage ? (
            <p className={`mb-3 text-sm ${draftState === "error" ? "text-red-300" : "text-emerald-300"}`}>
              {draftMessage}
            </p>
          ) : null}
          {invalidCustomerFields ? (
            <p className="mb-3 rounded-md border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
              Corrija CPF/CNPJ, e-mail ou telefone em Informações do Cliente antes de criar/exportar.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              className="focus-ring inline-flex h-10 items-center justify-center rounded-md border border-zinc-700 px-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              disabled={disabled}
              type="button"
              onClick={onCreateQuote}
            >
              {draftState === "creating" ? "Criando..." : "Criar"}
            </button>
            <button
              className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
              disabled={disabled}
              type="button"
              onClick={onGeneratePdf}
            >
              <FileText size={15} />
              {draftState === "creating_pdf" ? "Gerando..." : "PDF"}
            </button>
            <button
              className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              disabled={disabled}
              type="button"
              onClick={onCopyWhatsApp}
            >
              <Clipboard size={15} />
              {draftState === "copying_text" ? "Copiando..." : "WhatsApp"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

async function fetchQuoteWhatsAppText(quoteId: string) {
  const response = await fetch(`/api/quotes/${quoteId}/whatsapp`);
  if (!response.ok) throw new Error("WhatsApp text failed.");
  const payload = (await response.json()) as { text?: string };
  if (!payload.text) throw new Error("WhatsApp text missing.");
  return payload.text;
}

function currentDemoItem(
  variant: DemoProductVariant,
  quantity: number,
  unitPrice: number,
  totalPrice: number,
  artworkName: string,
  pricingCurve: PricingCurve
): DraftQuoteItem {
  return {
    id: "demo-item",
    productVariantId: variant.id,
    productLabel: `${variant.productName} - ${variant.variantName}`,
    artworkName: artworkName.trim() || "Arte 1",
    artworkFile: null,
    pricingCurve,
    quantity,
    unitPrice,
    totalPrice
  };
}

function buildDemoWhatsAppText({
  customerName,
  items,
  quoteId,
  shippingTotal,
  title
}: {
  customerName: string;
  items: DraftQuoteItem[];
  quoteId: string;
  shippingTotal: number;
  title: string;
}) {
  const itemsTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const grandTotal = itemsTotal + shippingTotal;

  return [
    `*${title.replace("Orcamento", "Orçamento")}*`,
    `Cliente: ${customerName.trim() || "Cliente não informado"}`,
    `Código: ${quoteId}`,
    "",
    "*Itens*",
    ...items.map((item, index) =>
      `${index + 1}. ${item.productLabel}${item.artworkName ? ` (${item.artworkName})` : ""} - ${item.quantity} un. x ${brl.format(item.unitPrice)} = ${brl.format(item.totalPrice)}${item.artworkFile ? `\n   Arte anexada: ${item.artworkFile.fileName}` : ""}`
    ),
    "",
    `Subtotal: ${brl.format(itemsTotal)}`,
    `Frete: ${brl.format(shippingTotal)}`,
    `Total: *${brl.format(grandTotal)}*`,
    "",
    "Orçamento demonstrativo gerado no Pricing Pro."
  ].join("\n");
}

function buildDemoQuoteDocument({
  customerName,
  items,
  quoteId,
  shippingTotal,
  title
}: {
  customerName: string;
  items: DraftQuoteItem[];
  quoteId: string;
  shippingTotal: number;
  title: string;
}) {
  const itemsTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const grandTotal = itemsTotal + shippingTotal;
  const rows = items
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.productLabel)}</strong>
            <span>${escapeHtml(item.artworkName || "Arte 1")}</span>
            ${item.artworkFile ? `<span>Arte anexada: ${escapeHtml(item.artworkFile.fileName)}</span>` : ""}
          </td>
          <td>${item.quantity}</td>
          <td>${brl.format(item.unitPrice)}</td>
          <td>${brl.format(item.totalPrice)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title.replace("Orcamento", "Orçamento"))}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #18181b; }
          header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #18181b; padding-bottom: 18px; }
          h1 { margin: 0; font-size: 26px; }
          p { margin: 4px 0; color: #52525b; }
          table { width: 100%; border-collapse: collapse; margin-top: 28px; }
          th { background: #18181b; color: white; text-align: left; }
          th, td { border: 1px solid #d4d4d8; padding: 10px; font-size: 13px; vertical-align: top; }
          td span { display: block; color: #71717a; margin-top: 3px; }
          .summary { margin-left: auto; margin-top: 24px; width: 320px; border: 1px solid #d4d4d8; padding: 14px; }
          .summary div { display: flex; justify-content: space-between; margin: 8px 0; }
          .total { font-size: 18px; font-weight: 700; border-top: 1px solid #d4d4d8; padding-top: 10px; }
          .demo { margin-top: 24px; padding: 10px; background: #fef3c7; color: #78350f; font-size: 12px; }
          @media print { body { margin: 24px; } button { display: none; } }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>${escapeHtml(title.replace("Orcamento", "Orçamento"))}</h1>
            <p>Pricing Pro - demonstração pública</p>
          </div>
          <div>
            <p><strong>Código:</strong> ${escapeHtml(quoteId)}</p>
            <p><strong>Cliente:</strong> ${escapeHtml(customerName.trim() || "Cliente não informado")}</p>
            <p><strong>Validade:</strong> 7 dias</p>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd.</th>
              <th>Unitário</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <section class="summary">
          <div><span>Subtotal</span><strong>${brl.format(itemsTotal)}</strong></div>
          <div><span>Frete</span><strong>${brl.format(shippingTotal)}</strong></div>
          <div class="total"><span>Total</span><strong>${brl.format(grandTotal)}</strong></div>
        </section>
        <p class="demo">Documento demonstrativo. Dados reais, custos e regras comerciais ficam protegidos na área logada.</p>
        <script>window.print();</script>
      </body>
    </html>
  `;
}

function writeDemoPdfWindow(pdfWindow: Window | null, html: string) {
  const target = pdfWindow ?? window.open("about:blank", "_blank");
  if (!target) return;
  target.document.open();
  target.document.write(html);
  target.document.close();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function DraftRuleButton({
  active,
  description,
  label,
  onClick
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`focus-ring rounded-md border px-3 py-2 text-left transition-colors ${
        active
          ? "border-amber-400 bg-amber-400/10 text-amber-100"
          : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700"
      }`}
      type="button"
      onClick={onClick}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="mt-1 block text-xs text-zinc-500">{description}</span>
    </button>
  );
}

function DetailsPanel({
  children,
  defaultOpen = false,
  icon,
  title
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  title: string;
}) {
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-medium text-amber-400">
          {icon}
          {title}
        </span>
        <span className="text-xs text-zinc-500">Clique para expandir/recolher</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function Control({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Input<T extends number | string>({
  error,
  helper,
  label,
  min,
  onBlur,
  onChange,
  placeholder,
  step,
  type = "text",
  value
}: {
  error?: string | null;
  helper?: string | null;
  label: string;
  min?: number;
  onBlur?: () => void;
  onChange: (value: T) => void;
  placeholder?: string;
  step?: number;
  type?: string;
  value: T;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <input
        className={`focus-ring h-10 w-full rounded-md border bg-zinc-950 px-3 text-sm text-white ${error ? "border-rose-400/60" : "border-zinc-700"}`}
        min={min}
        placeholder={placeholder}
        step={step}
        type={type}
        value={value}
        onBlur={onBlur}
        onChange={(event) => {
          const nextValue = type === "number" ? Number(event.target.value) : event.target.value;
          onChange(nextValue as T);
        }}
      />
      {error ? (
        <span className="mt-1 block text-xs text-rose-300">{error}</span>
      ) : helper ? (
        <span className="mt-1 block text-xs text-zinc-500">{helper}</span>
      ) : null}
    </label>
  );
}

function validateCustomerFields(input: { document: string; email: string; phone: string; phoneDdi: string }) {
  const documentDigits = onlyDigits(input.document);
  const phoneDigits = onlyDigits(input.phone);
  const ddiDigits = onlyDigits(input.phoneDdi);
  const documentType = documentDigits.length === 11 ? "cpf" : documentDigits.length === 14 ? "cnpj" : null;
  const errors = {
    document: input.document.trim() && !isValidCpfCnpj(documentDigits)
      ? "Informe um CPF ou CNPJ válido."
      : null,
    email: input.email.trim() && !isValidEmail(input.email)
      ? "Informe um e-mail válido."
      : null,
    phoneDdi: input.phoneDdi.trim() && !ddiDigits
      ? "Informe o DDI com código numérico."
      : null,
    phone: input.phone.trim() && !isValidBrazilPhone(phoneDigits)
      ? "Informe telefone fixo ou celular com DDD."
      : null
  };

  return { documentType, errors };
}

function assertValidCustomerFields(validation: ReturnType<typeof validateCustomerFields>) {
  const hasErrors = Object.values(validation.errors).some(Boolean);
  if (hasErrors) throw new Error("Invalid customer fields.");
}

function formatCpfCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

function formatBrazilPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/^(\(\d{2}\) \d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/^(\(\d{2}\) \d{5})(\d)/, "$1-$2");
}

function formatDdi(value: string) {
  const digits = onlyDigits(value).slice(0, 4);
  return digits ? `+${digits}` : "";
}

function formatInternationalPhone(ddi: string, phone: string) {
  const ddiDigits = onlyDigits(ddi || "55") || "55";
  const phoneDigits = onlyDigits(phone);
  return phoneDigits ? `+${ddiDigits} ${formatBrazilPhone(phoneDigits)}` : "";
}

function stripBrazilDdi(value: string) {
  const digits = onlyDigits(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits.slice(2);
  return digits;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function isValidBrazilPhone(digits: string) {
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (digits.length === 11) return digits[2] === "9";
  return true;
}

function isValidCpfCnpj(digits: string) {
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

function isValidCpf(digits: string) {
  if (/^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += Number(digits[index]) * (10 - index);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (check !== Number(digits[9])) return false;
  sum = 0;
  for (let index = 0; index < 10; index += 1) sum += Number(digits[index]) * (11 - index);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return check === Number(digits[10]);
}

function isValidCnpj(digits: string) {
  if (/^(\d)\1+$/.test(digits)) return false;
  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, ...firstWeights];
  const first = calculateCnpjDigit(digits.slice(0, 12), firstWeights);
  const second = calculateCnpjDigit(digits.slice(0, 12) + first, secondWeights);
  return `${first}${second}` === digits.slice(12);
}

function calculateCnpjDigit(base: string, weights: number[]) {
  const sum = weights.reduce((total, weight, index) => total + Number(base[index]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function CepPreview({ address, label }: { address: CepAddress | null; label: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      {address ? (
        <p className="mt-1 text-sm text-zinc-300">
          {[address.street, address.district, address.city, address.state, address.cep].filter(Boolean).join(" - ")}
        </p>
      ) : (
        <p className="mt-1 text-sm text-zinc-600">Informe um CEP válido para preencher automaticamente.</p>
      )}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 font-medium text-zinc-100">{value}</p>
    </div>
  );
}

function EditableCostToggle({
  checked,
  label,
  onChange,
  onValueChange,
  prefix,
  suffix,
  value
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  onValueChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
        <input
          checked={checked}
          className="h-4 w-4 accent-amber-500"
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
      <label className="mt-2 flex items-center gap-2">
        {prefix ? <span className="text-sm text-zinc-500">{prefix}</span> : null}
        <input
          className="focus-ring h-9 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm font-medium text-zinc-100 disabled:opacity-50"
          disabled={!checked}
          min={0}
          step="0.01"
          type="number"
          value={value}
          onChange={(event) => onValueChange(Number(event.target.value))}
        />
        {suffix ? <span className="text-sm text-zinc-500">{suffix}</span> : null}
      </label>
    </div>
  );
}

function Metric({
  icon,
  label,
  tone = "zinc",
  value
}: {
  icon?: React.ReactNode;
  label: string;
  tone?: "amber" | "emerald" | "red" | "zinc";
  value: string;
}) {
  const toneClass = {
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    red: "text-red-300",
    zinc: "text-white"
  }[tone];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <p className={`mt-2 break-words text-xl font-semibold sm:text-2xl ${toneClass}`}>{value}</p>
    </div>
  );
}

function ChartPanel({ children, subtitle, title }: { children: React.ReactNode; subtitle: string; title: string }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
      <div className="mb-3 grid gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-sm text-zinc-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Atual
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Simulado
          </span>
        </div>
      </div>
      {children}
    </section>
  );
}

function LineChart({
  anchors,
  current,
  formatValue,
  mode,
  simulated
}: {
  anchors?: readonly number[];
  current: ChartPoint[];
  formatValue: (value: number) => string;
  mode: PricingCurveMode;
  simulated: ChartPoint[];
}) {
  const [tooltip, setTooltip] = useState<{ point: ChartPoint; x: number; y: number } | null>(null);
  const allValues = [...current, ...simulated].map((point) => point.value);
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const yTicks = buildNiceTicks(rawMin, rawMax, 5);
  const min = yTicks[0];
  const max = yTicks[yTicks.length - 1];
  const range = Math.max(max - min, 0.01);
  const width = 920;
  const height = 340;
  const padding = { top: 24, right: 28, bottom: 54, left: 82 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minQuantity = Math.min(...simulated.map((point) => point.quantity));
  const maxQuantity = Math.max(...simulated.map((point) => point.quantity));
  const xTicks = buildQuantityTicks(minQuantity, maxQuantity, anchors);

  const toX = (quantity: number) =>
    padding.left + ((quantity - minQuantity) / Math.max(maxQuantity - minQuantity, 1)) * chartWidth;
  const toY = (value: number) => padding.top + (1 - (value - min) / range) * chartHeight;
  const linePath = (points: ChartPoint[], lineMode: PricingCurveMode) => {
    if (lineMode === "step") {
      return points
        .map((point, index) => {
          const x = toX(point.quantity).toFixed(2);
          const y = toY(point.value).toFixed(2);
          if (index === 0) return `M ${x} ${y}`;
          const previous = points[index - 1];
          return `L ${x} ${toY(previous.value).toFixed(2)} L ${x} ${y}`;
        })
        .join(" ");
    }

    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.quantity).toFixed(2)} ${toY(point.value).toFixed(2)}`)
      .join(" ");
  };
  const anchorSet = new Set(anchors ?? []);
  const highlightedAnchors = simulated.filter((point) => anchorSet.has(point.quantity));

  return (
    <div className="h-[300px] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-inner shadow-black/30 sm:h-[340px]">
      <svg
        className="h-full w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = width / rect.width;
          const svgX = (event.clientX - rect.left) * ratio;
          const nearest = simulated.reduce((closest, point) =>
            Math.abs(toX(point.quantity) - svgX) < Math.abs(toX(closest.quantity) - svgX) ? point : closest
          );
          if (!nearest) return;
          setTooltip({ point: nearest, x: toX(nearest.quantity), y: toY(nearest.value) });
        }}
      >
        <defs>
          <linearGradient id="current-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <linearGradient id="simulated-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#6ee7b7" />
          </linearGradient>
        </defs>

        <rect fill="#09090b" height={chartHeight} rx="10" width={chartWidth} x={padding.left} y={padding.top} />

        {yTicks.map((tick) => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line stroke="#27272a" strokeDasharray={tick === 0 ? "0" : "4 8"} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text fill="#a1a1aa" fontSize="12" textAnchor="end" x={padding.left - 12} y={y + 4}>
                {formatValue(tick)}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x = toX(tick);
          return (
            <g key={tick}>
              <line stroke="#18181b" x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} />
              <text fill="#a1a1aa" fontSize="12" fontWeight="600" textAnchor="middle" x={Math.round(x)} y={height - 20}>
                {tick.toLocaleString("pt-BR")}
              </text>
            </g>
          );
        })}

        <line stroke="#3f3f46" strokeWidth="1.5" x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
        <line stroke="#3f3f46" strokeWidth="1.5" x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
        <text fill="#71717a" fontSize="11" textAnchor="middle" transform={`rotate(-90 18 ${padding.top + chartHeight / 2})`} x="18" y={padding.top + chartHeight / 2}>
          Preco unitario
        </text>

        <path d={linePath(current, mode)} fill="none" opacity="0.85" stroke="url(#current-line)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <path d={linePath(simulated, mode)} fill="none" stroke="url(#simulated-line)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" />

        {highlightedAnchors.map((point) => (
          <g key={point.quantity}>
            <circle cx={toX(point.quantity)} cy={toY(point.value)} fill="#34d399" r="5" stroke="#f4f4f5" strokeWidth="1.5" />
          </g>
        ))}
        {tooltip ? (
          <g>
            <line stroke="#71717a" strokeDasharray="4 4" x1={tooltip.x} x2={tooltip.x} y1={padding.top} y2={height - padding.bottom} />
            <circle cx={tooltip.x} cy={tooltip.y} fill="#34d399" r="5" stroke="#f4f4f5" strokeWidth="1.5" />
            <rect
              fill="#18181b"
              height="64"
              rx="8"
              stroke="#3f3f46"
              width="190"
              x={Math.min(tooltip.x + 12, width - 210)}
              y={Math.max(tooltip.y - 78, 12)}
            />
            <text fill="#f4f4f5" fontSize="12" fontWeight="600" x={Math.min(tooltip.x + 24, width - 198)} y={Math.max(tooltip.y - 56, 34)}>
              Qtd: {tooltip.point.quantity}
            </text>
            <text fill="#d4d4d8" fontSize="11" x={Math.min(tooltip.x + 24, width - 198)} y={Math.max(tooltip.y - 38, 52)}>
              Base: {formatValue(tooltip.point.baseValue)}
            </text>
            <text fill="#34d399" fontSize="11" x={Math.min(tooltip.x + 24, width - 198)} y={Math.max(tooltip.y - 20, 70)}>
              Com custos: {formatValue(tooltip.point.finalValue)}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function buildNiceTicks(rawMin: number, rawMax: number, targetCount: number) {
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) return [0, 1];

  const minValue = Math.min(rawMin, rawMax);
  const maxValue = Math.max(rawMin, rawMax);
  const spread = Math.max(maxValue - minValue, 0.01);
  const step = niceNumber(spread / Math.max(targetCount - 1, 1));
  const minTick = Math.floor(minValue / step) * step;
  const maxTick = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];

  for (let value = minTick; value <= maxTick + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }

  return ticks.length >= 2 ? ticks : [minTick, minTick + step];
}

function niceNumber(value: number) {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

function buildQuantityTicks(minQuantity: number, maxQuantity: number, anchors?: readonly number[]) {
  const anchorTicks = (anchors ?? []).filter((quantity) => quantity >= minQuantity && quantity <= maxQuantity);
  const baseTicks = [minQuantity, ...anchorTicks, maxQuantity];
  let uniqueTicks = Array.from(new Set(baseTicks)).sort((a, b) => a - b);
  const range = Math.max(maxQuantity - minQuantity, 1);

  if (uniqueTicks.length > 1 && uniqueTicks[0] === minQuantity && uniqueTicks[1] - uniqueTicks[0] < range * 0.04) {
    uniqueTicks = uniqueTicks.slice(1);
  }

  if (uniqueTicks.length <= 7) return uniqueTicks;

  const step = Math.max(1, Math.ceil((uniqueTicks.length - 1) / 6));
  const reduced = uniqueTicks.filter((_, index) => index % step === 0);
  if (!reduced.includes(maxQuantity)) reduced.push(maxQuantity);
  return reduced;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-2 last:border-0 last:pb-0">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-100">{value}</dd>
    </div>
  );
}

function hasCurveChanges(current: PricingCurve, simulated: PricingCurve) {
  const currentPoints = normalizePricingCurvePoints(current.points);
  const simulatedPoints = normalizePricingCurvePoints(simulated.points);
  if (current.mode !== simulated.mode || currentPoints.length !== simulatedPoints.length) return true;

  return currentPoints.some((point, index) => {
    const simulatedPoint = simulatedPoints[index];
    return (
      point.quantity !== simulatedPoint.quantity ||
      Math.abs(point.unitPrice - simulatedPoint.unitPrice) > 0.001
    );
  });
}

function pricingCurvePoints(curve: PricingCurve, unitCost: number, platform: PlatformRule): ChartPoint[] {
  const normalizedCurve = { ...curve, points: normalizePricingCurvePoints(curve.points) };
  const maxQuantity = Math.min(
    Math.max(1000, normalizedCurve.points[normalizedCurve.points.length - 1]?.quantity ?? 1000),
    5000
  );
  const anchorSet = new Set(normalizedCurve.points.map((point) => point.quantity));
  const quantities = Array.from(
    new Set([
      ...Array.from({ length: 1000 }, (_, index) => Math.max(1, Math.round(1 + (index / 999) * (maxQuantity - 1)))),
      ...normalizedCurve.points.map((point) => point.quantity)
    ])
  ).sort((a, b) => a - b);

  return quantities.map((quantity) => {
    const baseValue = calculateCurveUnitPrice(quantity, normalizedCurve);
    const result = calculateQuote({
      quantity,
      unitCost,
      method: "anchors",
      curve: normalizedCurve,
      platform
    });
    return {
      baseValue,
      finalValue: result.finalUnitPrice,
      quantity,
      label: String(quantity),
      value: result.finalUnitPrice,
      isAnchor: anchorSet.has(quantity)
    };
  });
}

function emptyCurve(): PricingCurve {
  return { mode: "interpolated", points: DEFAULT_ANCHOR_QUANTITIES.map((quantity) => ({ quantity, unitPrice: 0 })) };
}

function resolveVariantCurve(
  variant: DemoProductVariant | undefined,
  platformKey: string,
  defaultPricingMode: PricingCurveMode | undefined
): PricingCurve {
  const platformCurve = variant?.platformCurves?.[platformKey];
  if (platformCurve) return platformCurve;

  const baseCurve = variant?.curve ?? emptyCurve();
  return { ...baseCurve, mode: defaultPricingMode ?? baseCurve.mode };
}

function pricingCurveToDefaultAnchors(curve: PricingCurve) {
  return {
    1: calculateCurveUnitPrice(1, curve),
    10: calculateCurveUnitPrice(10, curve),
    50: calculateCurveUnitPrice(50, curve),
    100: calculateCurveUnitPrice(100, curve),
    500: calculateCurveUnitPrice(500, curve),
    1000: calculateCurveUnitPrice(1000, curve)
  };
}

function anchorsToPointList(anchors: ReturnType<typeof pricingCurveToDefaultAnchors>) {
  return DEFAULT_ANCHOR_QUANTITIES.map((quantity) => ({ quantity, unitPrice: anchors[quantity] }));
}

function deltaClass(value: number) {
  if (value > 0) return "font-semibold text-emerald-300";
  if (value < 0) return "font-semibold text-red-300";
  return "font-semibold text-zinc-300";
}

function formatDeltaMoney(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${brl.format(value)}`;
}

function formatDeltaPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${percent.format(value)} p.p.`;
}

function buildQuickQuoteNotes(input: {
  customerAddressComplement: string;
  customerAddressNumber: string;
  destinationAddress: CepAddress | null;
  destinationPostalCode: string;
  includeShipping: boolean;
  originAddress: CepAddress | null;
  originPostalCode: string;
  shippingAmount: number;
  shippingService: string;
}) {
  const lines = ["Orcamento rapido gerado pelo precificador."];
  if (input.destinationPostalCode) lines.push(`CEP destino: ${input.destinationPostalCode}`);
  if (input.destinationAddress) {
    lines.push(
      `Endereco destino: ${formatCepAddress(input.destinationAddress, input.customerAddressNumber, input.customerAddressComplement)}`
    );
  }
  if (input.originPostalCode) lines.push(`CEP origem: ${input.originPostalCode}`);
  if (input.originAddress) lines.push(`Endereco origem: ${formatCepAddress(input.originAddress)}`);
  if (input.shippingService !== "manual") lines.push(`Servico de frete: ${input.shippingService}`);
  if (input.includeShipping) lines.push(`Frete incluido: ${brl.format(input.shippingAmount)}`);
  return lines.join("\n");
}

function extractMelhorEnvioOptions(result: unknown): MelhorEnvioQuoteOption[] {
  const rows = Array.isArray(result) ? result : result ? [result] : [];
  return rows
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const company = record.company && typeof record.company === "object" ? (record.company as Record<string, unknown>) : {};
      const price = numberFromUnknown(record.price) || numberFromUnknown(record.custom_price);
      const code = stringFromUnknown(record.id) ?? stringFromUnknown(record.service_id) ?? String(index + 1);
      const name = stringFromUnknown(record.name) ?? stringFromUnknown(record.service) ?? "Serviço";
      const companyName = stringFromUnknown(company.name) ?? stringFromUnknown(record.company) ?? "Melhor Envio";
      const deliveryTime = numberFromUnknown(record.delivery_time) || numberFromUnknown(record.custom_delivery_time) || null;
      if (!price || price <= 0) return null;
      return {
        code,
        name,
        companyName,
        price,
        deliveryTime,
        raw: row
      };
    })
    .filter((option): option is MelhorEnvioQuoteOption => Boolean(option))
    .sort((a, b) => a.price - b.price);
}

function defaultShippingService(activeShippingServices: NonNullable<PricingCalculatorProps["activeShippingServices"]>): ShippingServiceOption {
  if (activeShippingServices.melhorEnvio) return "melhor_envio";
  if (activeShippingServices.correios) return "pac";
  return "manual";
}

function extractShippingPackaging(value: unknown): ShippingPackagingSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const box = record.box && typeof record.box === "object" ? (record.box as Record<string, unknown>) : null;
  if (!box) return null;

  const widthCm = numberFromUnknown(box.widthCm);
  const lengthCm = numberFromUnknown(box.lengthCm);
  const heightCm = numberFromUnknown(box.heightCm);
  if (!widthCm || !lengthCm || !heightCm) return null;

  return {
    boxName: stringFromUnknown(box.name) ?? "Caixa selecionada",
    widthCm,
    lengthCm,
    heightCm,
    boxWeightKg: numberFromUnknown(box.weightKg),
    boxesNeeded: Math.max(1, Math.trunc(numberFromUnknown(record.boxesNeeded) || 1)),
    capacity: Math.max(0, Math.trunc(numberFromUnknown(record.capacity))),
    grossWeightKg: numberFromUnknown(record.grossWeightKg),
    grossWeightPerBoxKg: numberFromUnknown(record.grossWeightPerBoxKg)
  };
}

function numberFromUnknown(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function formatCm(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

function formatKg(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value)} kg`;
}

function formatShippingError(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const flattened = error as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    const fieldErrors = flattened.fieldErrors
      ? Object.entries(flattened.fieldErrors).flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
      : [];
    return [...(flattened.formErrors ?? []), ...fieldErrors].join(" ");
  }
  return "";
}

function formatCepAddress(address: CepAddress, number?: string, complement?: string) {
  const street = [address.street, number?.trim(), complement?.trim()].filter(Boolean).join(", ");
  return [street, address.district, address.city, address.state, address.cep].filter(Boolean).join(" - ");
}

function buildLocalPlatformOverride(input: {
  localCommissionRate: number;
  localFixedFee: number;
  localSellerShippingCost: number;
  sellerShippingThreshold: number;
}) {
  return {
    commissionRate: input.localCommissionRate,
    fixedFee: input.localFixedFee,
    sellerShippingCost: input.localSellerShippingCost,
    sellerShippingThreshold: input.sellerShippingThreshold
  };
}

function isAllowedArtworkMimeType(value: string): value is ArtworkFilePayload["mimeType"] {
  return ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"].includes(value);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
